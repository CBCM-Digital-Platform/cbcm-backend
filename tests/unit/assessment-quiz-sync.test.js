process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite::memory:';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const models = require('../../src/models');
const assessmentsRepository = require('../../src/repositories/assessments.repository');
const certificatesRepository = require('../../src/repositories/certificates.repository');
const assessmentsService = require('../../src/services/assessments.service');
const passingRulesService = require('../../src/services/assessment-passing-rules.service');
const certificatesService = require('../../src/services/certificates.service');

const baseAssessment = () => ({
	id: 41,
	mentee_id: 7,
	mentor_id: 9,
	facility_id: 3,
	cycle_id: 5,
	thematic_area_id: 11,
	status: 'in_review',
	prerequisites_met: true,
	practical_score: 4,
});

function configureQuizFlow({ assessment = baseAssessment(), quizRows, attempts = {}, modules } = {}) {
	const originals = {
		findById: assessmentsRepository.findById,
		findWithIncludes: assessmentsRepository.findWithIncludes,
		moduleFindAll: models.LearningModule.findAll,
		quizFindAll: models.Quiz.findAll,
		quizCount: models.Quiz.count,
		attemptFindOne: models.QuizAttempt.findOne,
		criteriaDestroy: models.AssessmentCriteriaScore.destroy,
		criteriaCreate: models.AssessmentCriteriaScore.create,
		criteriaFindAll: models.AssessmentCriteriaScore.findAll,
		assessmentUpdate: models.Assessment.update,
		transaction: models.sequelize.transaction,
		getActivePassingRule: passingRulesService.getActivePassingRule,
		certificateFindAssessment: certificatesRepository.findEligibleAssessment,
		certificateFindActive: certificatesRepository.findActiveCertificate,
		userFindByPk: models.User.findByPk,
	};
	const captured = { quizQueries: [], attemptQueries: [], writes: [] };
	assessmentsRepository.findById = async () => assessment;
	assessmentsRepository.findWithIncludes = async () => assessment;
	models.LearningModule.findAll = async () => modules || [{ id: 21 }];
	models.Quiz.findAll = async (options) => {
		captured.quizQueries.push(options);
		return quizRows || [{
			id: options.where.assessment_component === 'criteria' ? 101 : 102,
			title: 'Mapped quiz',
			attempt_limit: 3,
		}];
	};
	models.Quiz.count = async () => 1;
	models.QuizAttempt.findOne = async (options) => {
		captured.attemptQueries.push(options);
		return attempts[options.where.quiz_id] || null;
	};
	models.AssessmentCriteriaScore.destroy = async (options) => {
		captured.writes.push(['criteria-destroy', options]);
		return 1;
	};
	models.AssessmentCriteriaScore.create = async (data, options) => {
		captured.writes.push(['criteria-create', data, options]);
		return { id: 1, ...data };
	};
	models.AssessmentCriteriaScore.findAll = async () => [];
	models.Assessment.update = async (data, options) => {
		captured.writes.push(['assessment-update', data, options]);
		return [1];
	};
	models.sequelize.transaction = async (callback) => callback({ transaction: true });
	passingRulesService.getActivePassingRule = async () => ({
		criteria_min_score: 85,
		theory_min_score: 90,
		practical_min_score: 3,
	});
	certificatesRepository.findEligibleAssessment = async () => assessment;
	certificatesRepository.findActiveCertificate = async () => null;
	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: assessment.facility_id });

	return {
		captured,
		restore() {
			assessmentsRepository.findById = originals.findById;
			assessmentsRepository.findWithIncludes = originals.findWithIncludes;
			models.LearningModule.findAll = originals.moduleFindAll;
			models.Quiz.findAll = originals.quizFindAll;
			models.Quiz.count = originals.quizCount;
			models.QuizAttempt.findOne = originals.attemptFindOne;
			models.AssessmentCriteriaScore.destroy = originals.criteriaDestroy;
			models.AssessmentCriteriaScore.create = originals.criteriaCreate;
			models.AssessmentCriteriaScore.findAll = originals.criteriaFindAll;
			models.Assessment.update = originals.assessmentUpdate;
			models.sequelize.transaction = originals.transaction;
			passingRulesService.getActivePassingRule = originals.getActivePassingRule;
			certificatesRepository.findEligibleAssessment = originals.certificateFindAssessment;
			certificatesRepository.findActiveCertificate = originals.certificateFindActive;
			models.User.findByPk = originals.userFindByPk;
		},
	};
}

const completedAttempt = ({ id, quizId, menteeId = 7, attemptNumber = 1, score }) => ({
	id,
	quiz_id: quizId,
	mentee_id: menteeId,
	attempt_number: attemptNumber,
	score,
	status: 'completed',
	completed_at: new Date('2026-11-01T10:00:00Z'),
});

test('criteria synchronization uses the mapped criteria quiz and the latest valid completed attempt', async () => {
	const latest = completedAttempt({ id: 2, quizId: 101, attemptNumber: 2, score: 86 });
	const setup = configureQuizFlow({ attempts: { 101: latest } });
	try {
		const result = await assessmentsService.syncCriteriaScoresFromQuiz(41, { id: 9, role: 'mentor' });
		assert.equal(result.synced, true);
		assert.equal(result.criteria_score, 86);
		assert.equal(result.criteria_passed, true);
		assert.equal(result.quiz_attempt_id, 2);
		assert.equal(setup.captured.attemptQueries[0].where.quiz_id, 101);
		assert.equal(setup.captured.attemptQueries[0].where.mentee_id, 7);
		assert.equal(setup.captured.attemptQueries[0].where.status, 'completed');
		assert.equal(setup.captured.attemptQueries[0].order[0][0], 'completed_at');
		assert.equal(setup.captured.quizQueries[0].where.assessment_component, 'criteria');
		assert.equal(setup.captured.quizQueries[0].where.module_id[Object.getOwnPropertySymbols(setup.captured.quizQueries[0].where.module_id)[0]][0], 21);
		assert.deepEqual(setup.captured.writes[1][1], {
			assessment_id: 41,
			criterion: 'quiz:101:attempt:2',
			score: 86,
		});
	} finally {
		setup.restore();
	}
});

test('repeating criteria synchronization replaces the prior result without duplicating it', async () => {
	const latest = completedAttempt({ id: 2, quizId: 101, attemptNumber: 2, score: 86 });
	const setup = configureQuizFlow({ attempts: { 101: latest } });
	try {
		await assessmentsService.syncCriteriaScoresFromQuiz(41, { id: 9, role: 'mentor' });
		await assessmentsService.syncCriteriaScoresFromQuiz(41, { id: 9, role: 'mentor' });
		assert.equal(setup.captured.writes.filter(([kind]) => kind === 'criteria-destroy').length, 2);
		assert.equal(setup.captured.writes.filter(([kind]) => kind === 'criteria-create').length, 2);
	} finally {
		setup.restore();
	}
});

test('criteria synchronization returns without writes when no completed attempt exists', async () => {
	const setup = configureQuizFlow();
	try {
		const result = await assessmentsService.syncCriteriaScoresFromQuiz(41, { id: 9, role: 'mentor' });
		assert.equal(result.synced, false);
		assert.match(result.reason, /No valid completed quiz attempt/);
		assert.equal(setup.captured.writes.length, 0);
	} finally {
		setup.restore();
	}
});

test('criteria synchronization rejects multiple mapped quizzes instead of choosing one', async () => {
	const setup = configureQuizFlow({
		quizRows: [
			{ id: 101, title: 'Criteria A', attempt_limit: 1 },
			{ id: 103, title: 'Criteria B', attempt_limit: 1 },
		],
	});
	try {
		await assert.rejects(
			assessmentsService.syncCriteriaScoresFromQuiz(41, { id: 9, role: 'mentor' }),
			{ statusCode: 409, code: 'AMBIGUOUS_ASSESSMENT_QUIZZES' }
		);
		assert.equal(setup.captured.writes.length, 0);
	} finally {
		setup.restore();
	}
});

test('criteria synchronization ignores attempts outside the configured attempt limit', async () => {
	const setup = configureQuizFlow({
		attempts: { 101: completedAttempt({ id: 4, quizId: 101, attemptNumber: 4, score: 99 }) },
	});
	try {
		const result = await assessmentsService.syncCriteriaScoresFromQuiz(41, { id: 9, role: 'mentor' });
		assert.equal(result.synced, false);
		assert.equal(setup.captured.writes.length, 0);
	} finally {
		setup.restore();
	}
});

test('criteria synchronization does not persist an invalid completed-attempt score', async () => {
	const setup = configureQuizFlow({
		attempts: { 101: completedAttempt({ id: 5, quizId: 101, score: 101 }) },
	});
	try {
		const result = await assessmentsService.syncCriteriaScoresFromQuiz(41, { id: 9, role: 'mentor' });
		assert.equal(result.synced, false);
		assert.match(result.reason, /invalid score/);
		assert.equal(setup.captured.writes.length, 0);
	} finally {
		setup.restore();
	}
});

test('theory synchronization authorizes a system administrator and assigned mentor', async () => {
	const setup = configureQuizFlow({
		attempts: { 102: completedAttempt({ id: 8, quizId: 102, score: 90 }) },
	});
	try {
		const adminResult = await assessmentsService.syncTheoryScoreFromQuiz(41, { id: 1, role: 'admin' });
		assert.equal(adminResult.synced, true);
		assert.equal(adminResult.theory_passed, true);
		const mentorResult = await assessmentsService.syncTheoryScoreFromQuiz(41, { id: 9, role: 'mentor' });
		assert.equal(mentorResult.synced, true);
	} finally {
		setup.restore();
	}
});

test('theory synchronization rejects facility administrators outside the assessment facility', async () => {
	const setup = configureQuizFlow();
	try {
		await assert.rejects(
			assessmentsService.syncTheoryScoreFromQuiz(41, { id: 3, role: 'facility_admin', facility_id: 4 }),
			{ statusCode: 403, code: 'FORBIDDEN' }
		);
		assert.equal(setup.captured.quizQueries.length, 0);
	} finally {
		setup.restore();
	}
});

test('theory synchronization rejects unrelated users and mentees', async () => {
	const setup = configureQuizFlow();
	try {
		for (const actor of [
			{ id: 90, role: 'user' },
			{ id: 7, role: 'mentee' },
		]) {
			await assert.rejects(
				assessmentsService.syncTheoryScoreFromQuiz(41, actor),
				{ statusCode: 403, code: 'FORBIDDEN' }
			);
		}
		assert.equal(setup.captured.quizQueries.length, 0);
	} finally {
		setup.restore();
	}
});

test('theory synchronization permits an in-scope facility administrator and rejects another mentor', async () => {
	const setup = configureQuizFlow();
	try {
		const result = await assessmentsService.syncTheoryScoreFromQuiz(41, {
			id: 3,
			role: 'facility_admin',
			facility_id: 3,
		});
		assert.equal(result.synced, false);
		await assert.rejects(
			assessmentsService.syncTheoryScoreFromQuiz(41, { id: 77, role: 'mentor' }),
			{ statusCode: 403, code: 'FORBIDDEN' }
		);
	} finally {
		setup.restore();
	}
});

test('assessment and issuance eligibility both reject missing and failing criteria quiz results', async () => {
	const scenarios = [
		{ name: 'missing', attempts: {}, expected: 'pending' },
		{ name: 'failing', attempts: { 101: completedAttempt({ id: 1, quizId: 101, score: 84 }) }, expected: 'failed' },
	];
	for (const scenario of scenarios) {
		const setup = configureQuizFlow({ attempts: scenario.attempts });
		try {
			const assessmentEligibility = await assessmentsService.getCertificateEligibility(41, { id: 1, role: 'admin' });
			assert.equal(assessmentEligibility.components.criteria.status, scenario.expected, scenario.name);
			assert.equal(assessmentEligibility.eligible_for_certificate, false, scenario.name);
			const issuanceEligibility = await certificatesService.checkEligibility(7, 5, 11, { id: 1, role: 'admin' });
			assert.equal(issuanceEligibility.eligible, false, scenario.name);
			assert.equal(issuanceEligibility.assessmentEligibility.eligible_for_certificate, false, scenario.name);
		} finally {
			setup.restore();
		}
	}
});

test('eligibility applies each configured threshold, requires practical score, prerequisites, and finalization', async () => {
	const attempts = {
		101: completedAttempt({ id: 1, quizId: 101, score: 85 }),
		102: completedAttempt({ id: 2, quizId: 102, score: 90 }),
	};
	const finalizedAssessment = { ...baseAssessment(), status: 'finalized' };
	const setup = configureQuizFlow({ attempts, assessment: finalizedAssessment });
	try {
		const passing = await assessmentsService.getCertificateEligibility(41, { id: 1, role: 'admin' });
		assert.equal(passing.eligible_for_certificate, true);
		const issuance = await certificatesService.checkEligibility(7, 5, 11, { id: 1, role: 'admin' });
		assert.equal(issuance.eligible, true);

		const assessment = { ...baseAssessment(), status: 'finalized' };
		assessment.practical_score = null;
		assessmentsRepository.findWithIncludes = async () => assessment;
		const missingPractical = await assessmentsService.getCertificateEligibility(41, { id: 1, role: 'admin' });
		assert.equal(missingPractical.components.practical.status, 'pending');
		assert.equal(missingPractical.eligible_for_certificate, false);

		assessment.practical_score = 4;
		assessment.prerequisites_met = false;
		const unmetPrerequisite = await assessmentsService.getCertificateEligibility(41, { id: 1, role: 'admin' });
		assert.equal(unmetPrerequisite.eligible_for_certificate, false);

		assessment.prerequisites_met = true;
		assessment.status = 'in_review';
		const unfinished = await assessmentsService.getCertificateEligibility(41, { id: 1, role: 'admin' });
		assert.equal(unfinished.eligible_for_certificate, false);

		assessment.status = 'finalized';
		assessment.practical_score = 2;
		const failedPractical = await assessmentsService.getCertificateEligibility(41, { id: 1, role: 'admin' });
		assert.equal(failedPractical.components.practical.status, 'failed');
		assert.equal(failedPractical.eligible_for_certificate, false);

		assessment.practical_score = 4;
		attempts[102] = completedAttempt({ id: 2, quizId: 102, score: 89 });
		const failedTheory = await assessmentsService.getCertificateEligibility(41, { id: 1, role: 'admin' });
		assert.equal(failedTheory.components.theory.status, 'failed');
		assert.equal(failedTheory.eligible_for_certificate, false);
	} finally {
		setup.restore();
	}
});

test('manual criteria scores cannot override a configured criteria quiz', async () => {
	const setup = configureQuizFlow();
	try {
		await assert.rejects(
			assessmentsService.setCriteriaScore(41, {
				criteria_scores: [{ criterion: 'Manual', score: 100 }],
			}, { id: 9, role: 'mentor' }),
			{ statusCode: 400, code: 'MANUAL_OVERRIDE_FORBIDDEN' }
		);
	} finally {
		setup.restore();
	}
});
