// src/jobs/knowledge-score-recompute.job.js
// Utility to backfill progress snapshots from finalized assessments
// This is a synchronous utility function, not a queued job (no queue infrastructure exists)
const { Assessment } = require('../models');
const progressService = require('../services/progress.service');

async function backfillSnapshotsForFinalizedAssessments(options = {}) {
	const { dryRun = false, batchSize = 100, assessmentId = null } = options;

	let query = {
		where: {
			status: 'finalized',
			aggregate_score: { [require('sequelize').Op.ne]: null },
		},
	};

	if (assessmentId) {
		query.where.id = assessmentId;
	}

	const assessments = await Assessment.findAll(query);
	const results = {
		total: assessments.length,
		processed: 0,
		skipped: 0,
		failed: 0,
		errors: [],
	};

	for (const assessment of assessments) {
		try {
			if (dryRun) {
				results.skipped++;
				console.log(`[DRY RUN] Would create snapshot for assessment ${assessment.id}`);
				continue;
			}

			// Create a mock actor object with the mentor who finalized the assessment
			const actor = {
				id: assessment.mentor_id || assessment.updated_by,
				role: 'mentor',
			};

			await progressService.createSnapshotFromAssessment(assessment, actor);
			results.processed++;
			console.log(`Created snapshot for assessment ${assessment.id}`);
		} catch (error) {
			results.failed++;
			results.errors.push({
				assessmentId: assessment.id,
				error: error.message,
			});
			console.error(`Failed to create snapshot for assessment ${assessment.id}:`, error.message);
		}
	}

	return results;
}

module.exports = {
	backfillSnapshotsForFinalizedAssessments,
};
