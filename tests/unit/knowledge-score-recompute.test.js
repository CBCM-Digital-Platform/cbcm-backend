// tests/unit/knowledge-score-recompute.test.js
process.env.JWT_SECRET = 'knowledge-score-recompute-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const backfillJob = require('../../src/jobs/knowledge-score-recompute.job');
const progressService = require('../../src/services/progress.service');
const models = require('../../src/models');

test('backfill in dry-run mode does not create snapshots', async () => {
	const originals = {
		findAll: models.Assessment.findAll,
		createSnapshotFromAssessment: progressService.createSnapshotFromAssessment,
	};

	const mockAssessments = [
		{ id: 1, mentor_id: 10, updated_by: 10, status: 'finalized', aggregate_score: 85 },
		{ id: 2, mentor_id: 10, updated_by: 10, status: 'finalized', aggregate_score: 90 },
	];

	models.Assessment.findAll = async () => mockAssessments;
	let snapshotCalled = false;
	progressService.createSnapshotFromAssessment = async () => {
		snapshotCalled = true;
	};

	try {
		const result = await backfillJob.backfillSnapshotsForFinalizedAssessments({ dryRun: true });
		assert.strictEqual(snapshotCalled, false);
		assert.strictEqual(result.total, 2);
		assert.strictEqual(result.processed, 0);
		assert.strictEqual(result.skipped, 2);
		assert.strictEqual(result.failed, 0);
	} finally {
		models.Assessment.findAll = originals.findAll;
		progressService.createSnapshotFromAssessment = originals.createSnapshotFromAssessment;
	}
});

test('backfill in normal mode creates snapshots for finalized assessments', async () => {
	const originals = {
		findAll: models.Assessment.findAll,
		createSnapshotFromAssessment: progressService.createSnapshotFromAssessment,
	};

	const mockAssessments = [
		{ id: 1, mentor_id: 10, updated_by: 10, status: 'finalized', aggregate_score: 85 },
		{ id: 2, mentor_id: 10, updated_by: 10, status: 'finalized', aggregate_score: 90 },
	];

	models.Assessment.findAll = async () => mockAssessments;
	let snapshotCount = 0;
	progressService.createSnapshotFromAssessment = async () => {
		snapshotCount++;
	};

	try {
		const result = await backfillJob.backfillSnapshotsForFinalizedAssessments({ dryRun: false });
		assert.strictEqual(snapshotCount, 2);
		assert.strictEqual(result.total, 2);
		assert.strictEqual(result.processed, 2);
		assert.strictEqual(result.skipped, 0);
		assert.strictEqual(result.failed, 0);
	} finally {
		models.Assessment.findAll = originals.findAll;
		progressService.createSnapshotFromAssessment = originals.createSnapshotFromAssessment;
	}
});

test('backfill handles snapshot creation failures gracefully', async () => {
	const originals = {
		findAll: models.Assessment.findAll,
		createSnapshotFromAssessment: progressService.createSnapshotFromAssessment,
	};

	const mockAssessments = [
		{ id: 1, mentor_id: 10, updated_by: 10, status: 'finalized', aggregate_score: 85 },
		{ id: 2, mentor_id: 10, updated_by: 10, status: 'finalized', aggregate_score: 90 },
	];

	models.Assessment.findAll = async () => mockAssessments;
	let callCount = 0;
	progressService.createSnapshotFromAssessment = async () => {
		callCount++;
		if (callCount === 1) {
			return;
		}
		throw new Error('Snapshot creation failed');
	};

	try {
		const result = await backfillJob.backfillSnapshotsForFinalizedAssessments({ dryRun: false });
		assert.strictEqual(result.total, 2);
		assert.strictEqual(result.processed, 1);
		assert.strictEqual(result.failed, 1);
		assert.strictEqual(result.errors.length, 1);
		assert.strictEqual(result.errors[0].assessmentId, 2);
	} finally {
		models.Assessment.findAll = originals.findAll;
		progressService.createSnapshotFromAssessment = originals.createSnapshotFromAssessment;
	}
});

test('backfill with assessmentId filters to specific assessment', async () => {
	const originals = {
		findAll: models.Assessment.findAll,
		createSnapshotFromAssessment: progressService.createSnapshotFromAssessment,
	};

	const mockAssessments = [
		{ id: 5, mentor_id: 10, updated_by: 10, status: 'finalized', aggregate_score: 85 },
	];

	models.Assessment.findAll = async (query) => {
		if (query.where.id === 5) {
			return mockAssessments;
		}
		return [];
	};
	let snapshotCalled = false;
	progressService.createSnapshotFromAssessment = async () => {
		snapshotCalled = true;
	};

	try {
		const result = await backfillJob.backfillSnapshotsForFinalizedAssessments({ dryRun: false, assessmentId: 5 });
		assert.strictEqual(snapshotCalled, true);
		assert.strictEqual(result.total, 1);
		assert.strictEqual(result.processed, 1);
	} finally {
		models.Assessment.findAll = originals.findAll;
		progressService.createSnapshotFromAssessment = originals.createSnapshotFromAssessment;
	}
});

test('backfill respects updated_by when mentor_id is null', async () => {
	const originals = {
		findAll: models.Assessment.findAll,
		createSnapshotFromAssessment: progressService.createSnapshotFromAssessment,
	};

	const mockAssessments = [
		{ id: 1, mentor_id: null, updated_by: 20, status: 'finalized', aggregate_score: 85 },
	];

	models.Assessment.findAll = async () => mockAssessments;
	let actorUsed;
	progressService.createSnapshotFromAssessment = async (assessment, actor) => {
		actorUsed = actor;
	};

	try {
		await backfillJob.backfillSnapshotsForFinalizedAssessments({ dryRun: false });
		assert.strictEqual(actorUsed.id, 20);
		assert.strictEqual(actorUsed.role, 'mentor');
	} finally {
		models.Assessment.findAll = originals.findAll;
		progressService.createSnapshotFromAssessment = originals.createSnapshotFromAssessment;
	}
});
