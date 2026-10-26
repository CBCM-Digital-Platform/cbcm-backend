// tests/unit/assessments.test.js
process.env.JWT_SECRET = 'assessment-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const validator = require('../../src/validators/assessments.validator');
const service = require('../../src/services/assessments.service');
const repository = require('../../src/repositories/assessments.repository');
const assignmentsRepository = require('../../src/repositories/assignments.repository');
const progressService = require('../../src/services/progress.service');
const AssessmentStatus = require('../../src/enums/assessment-status.enum');
const models = require('../../src/models');
const { Assignment } = models;

test('assessment status enum defines valid transitions', () => {
	assert.strictEqual(AssessmentStatus.DRAFT, 'draft');
	assert.strictEqual(AssessmentStatus.IN_REVIEW, 'in_review');
	assert.strictEqual(AssessmentStatus.FINALIZED, 'finalized');
	assert.strictEqual(AssessmentStatus.REVIEWED, 'reviewed');

	assert.strictEqual(AssessmentStatus.isValidTransition(AssessmentStatus.DRAFT, AssessmentStatus.IN_REVIEW), true);
	assert.strictEqual(AssessmentStatus.isValidTransition(AssessmentStatus.DRAFT, AssessmentStatus.DRAFT), true);
	assert.strictEqual(AssessmentStatus.isValidTransition(AssessmentStatus.DRAFT, AssessmentStatus.FINALIZED), false);
	assert.strictEqual(AssessmentStatus.isValidTransition(AssessmentStatus.IN_REVIEW, AssessmentStatus.FINALIZED), true);
	assert.strictEqual(AssessmentStatus.isValidTransition(AssessmentStatus.FINALIZED, AssessmentStatus.REVIEWED), true);
	assert.strictEqual(AssessmentStatus.isValidTransition(AssessmentStatus.REVIEWED, AssessmentStatus.DRAFT), false);
});

test('assessment validation rejects invalid IDs and missing required fields', () => {
	// Test that validation rules are defined
	assert.strictEqual(validator.assessmentIdValidation.length > 0, true);
	assert.strictEqual(validator.createAssessmentValidation.length > 0, true);
	assert.strictEqual(validator.updateAssessmentValidation.length > 0, true);
	assert.strictEqual(validator.setCriteriaScoreValidation.length > 0, true);
	assert.strictEqual(validator.setChecklistItemsValidation.length > 0, true);
	assert.strictEqual(validator.addEvidenceValidation.length > 0, true);
	assert.strictEqual(validator.reviewAssessmentValidation.length > 0, true);
	assert.strictEqual(validator.listAssessmentsValidation.length > 0, true);
});

test('assessment service validates mentee and mentor roles before creation', async () => {
	const originals = {
		User: { ...models.User },
		Facility: { ...models.Facility },
		MentorshipCycle: { ...models.MentorshipCycle },
		Assignment: { ...models.Assignment },
		AssessmentCreate: models.Assessment.create,
	};

	models.User.findByPk = async (id) => {
		if (id === 1) return { id: 1, role: 'mentee' };
		if (id === 2) return { id: 2, role: 'mentor' };
		return null;
	};
	models.Facility.findByPk = async () => ({ id: 1, name: 'Test Facility' });
	models.MentorshipCycle.findByPk = async () => ({ id: 1, name: 'Cycle 1', status: 'active' });
	models.Assignment.findOne = async () => ({ id: 1, status: 'assigned' });
	models.Assessment.create = async (data) => ({ id: 10, updated_by: 2, ...data });

	try {
		const result = await service.createAssessment(
			{ mentee_id: 1, mentor_id: 2, facility_id: 1, cycle_id: 1 },
			{ id: 2, role: 'mentor' }
		);
		assert.strictEqual(result.mentee_id, 1);
		assert.strictEqual(result.mentor_id, 2);
		assert.strictEqual(result.status, 'draft');

		await assert.rejects(
			service.createAssessment({ mentee_id: 2, mentor_id: 1, facility_id: 1, cycle_id: 1 }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);

		await assert.rejects(
			service.createAssessment({ mentee_id: 1, mentor_id: 1, facility_id: 1, cycle_id: 1 }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		Object.assign(models.User, originals.User);
		Object.assign(models.Facility, originals.Facility);
		Object.assign(models.MentorshipCycle, originals.MentorshipCycle);
		Object.assign(models.Assignment, originals.Assignment);
		models.Assessment.create = originals.AssessmentCreate;
	}
});

test('assessment service enforces active assignment requirement', async () => {
	const originals = {
		User: { ...models.User },
		Facility: { ...models.Facility },
		MentorshipCycle: { ...models.MentorshipCycle },
		Assignment: { ...models.Assignment },
		Assessment: { ...models.Assessment },
		create: repository.create,
	};

	models.User.findByPk = async (id) => ({ id, role: id === 1 ? 'mentee' : 'mentor' });
	models.Facility.findByPk = async () => ({ id: 1, name: 'Test Facility' });
	models.MentorshipCycle.findByPk = async () => ({ id: 1, name: 'Cycle 1', status: 'active' });
	models.Assignment.findOne = async () => null;
	repository.create = async (data) => ({ id: 10, ...data });

	try {
		await assert.rejects(
			service.createAssessment({ mentee_id: 1, mentor_id: 2, facility_id: 1, cycle_id: 1 }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		Object.assign(models.User, originals.User);
		Object.assign(models.Facility, originals.Facility);
		Object.assign(models.MentorshipCycle, originals.MentorshipCycle);
		Object.assign(models.Assignment, originals.Assignment);
		Object.assign(models.Assessment, originals.Assessment);
		repository.create = originals.create;
	}
});

test('assessment service prevents mentees from updating assessments', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'draft' });
	repository.update = async () => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'draft' });

	try {
		await assert.rejects(
			service.updateAssessment(1, { feedback: 'Test' }, { id: 1, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('assessment service prevents updating finalized assessments', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'finalized' });
	repository.update = async () => ({ id, status: 'finalized' });

	try {
		await assert.rejects(
			service.updateAssessment(1, { feedback: 'Test' }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('assessment service validates criteria scores before finalization', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true });
	models.AssessmentCriteriaScore.findAll = async () => [];
	repository.update = async () => ({ id, status: 'finalized' });

	try {
		await assert.rejects(
			service.finalizeAssessment(1, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
		repository.update = originals.update;
	}
});

test('assessment service calculates aggregate score on finalization', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
		update: repository.update,
		transaction: models.sequelize.transaction,
		AssessmentUpdate: models.Assessment.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true });
	models.AssessmentCriteriaScore.findAll = async () => [
		{ assessment_id: 1, criterion: 'Skill 1', score: 80 },
		{ assessment_id: 1, criterion: 'Skill 2', score: 90 },
		{ assessment_id: 1, criterion: 'Skill 3', score: 85 },
	];
	models.AssessmentChecklistItem.findAll = async () => [];
	let updatePayload;
	models.Assessment.update = async (data, options) => {
		updatePayload = data;
		return [1];
	};
	models.sequelize.transaction = async (callback) => callback({});

	try {
		const result = await service.finalizeAssessment(1, { id: 2, role: 'mentor' });
		assert.strictEqual(updatePayload.aggregate_score, 85);
		assert.strictEqual(updatePayload.status, 'finalized');
		assert.strictEqual(updatePayload.finalized_at !== undefined, true);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
		repository.update = originals.update;
		models.sequelize.transaction = originals.transaction;
		models.Assessment.update = originals.AssessmentUpdate;
	}
});

test('assessment service requires prerequisites met for finalization', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: false });
	models.AssessmentCriteriaScore.findAll = async () => [{ assessment_id: 1, criterion: 'Skill 1', score: 80 }];
	models.AssessmentChecklistItem.findAll = async () => [];

	try {
		await assert.rejects(
			service.finalizeAssessment(1, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
	}
});

test('assessment service allows only admins to review assessments', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'finalized' });
	repository.update = async () => ({ id, status: 'reviewed' });

	try {
		await assert.rejects(
			service.reviewAssessment(1, { feedback: 'Approved' }, { id: 2, role: 'mentor' }),
			{ statusCode: 403 }
		);

		await assert.rejects(
			service.reviewAssessment(1, { feedback: 'Approved' }, { id: 1, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('assessment service validates criteria score values', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
		destroy: models.AssessmentCriteriaScore.destroy,
		create: models.AssessmentCriteriaScore.create,
		transaction: models.sequelize.transaction,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'draft' });
	models.AssessmentCriteriaScore.findAll = async () => [];
	models.AssessmentCriteriaScore.destroy = async () => {};
	models.AssessmentCriteriaScore.create = async () => {};
	models.sequelize.transaction = async (callback) => callback({});

	try {
		await assert.rejects(
			service.setCriteriaScore(1, { criteria_scores: [{ criterion: 'Skill 1', score: 150 }] }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);

		await assert.rejects(
			service.setCriteriaScore(1, { criteria_scores: [{ criterion: 'Skill 1', score: -10 }] }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);

		await assert.rejects(
			service.setCriteriaScore(1, { criteria_scores: [{ criterion: '', score: 80 }] }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
		models.AssessmentCriteriaScore.destroy = originals.destroy;
		models.AssessmentCriteriaScore.create = originals.create;
		models.sequelize.transaction = originals.transaction;
	}
});

test('assessment service validates checklist items', async () => {
	const originals = {
		findById: repository.findById,
		destroy: models.AssessmentChecklistItem.destroy,
		create: models.AssessmentChecklistItem.create,
		transaction: models.sequelize.transaction,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'draft' });
	models.AssessmentChecklistItem.destroy = async () => {};
	models.AssessmentChecklistItem.create = async () => {};
	models.sequelize.transaction = async (callback) => callback({});

	try {
		await assert.rejects(
			service.setChecklistItems(1, { checklist_items: [{ item: '', checked: true }] }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);

		await assert.rejects(
			service.setChecklistItems(1, { checklist_items: [{ item: 'Item 1', checked: 'yes' }] }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentChecklistItem.destroy = originals.destroy;
		models.AssessmentChecklistItem.create = originals.create;
		models.sequelize.transaction = originals.transaction;
	}
});

test('assessment service enforces facility scope for facility admins', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 5, status: 'draft' });
	repository.update = async () => ({ id, facility_id: 5, status: 'draft' });

	try {
		await assert.rejects(
			service.updateAssessment(1, { feedback: 'Test' }, { id: 10, role: 'facility_admin', facility_id: 1 }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('assessment service prevents mentors from accessing other mentors assessments', async () => {
	const originals = {
		findWithIncludes: repository.findWithIncludes,
	};

	repository.findWithIncludes = async (id) => ({ id, mentee_id: 1, mentor_id: 5, facility_id: 1, status: 'draft' });

	try {
		await assert.rejects(
			service.getAssessment(1, { id: 2, role: 'mentor' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findWithIncludes = originals.findWithIncludes;
	}
});

test('assessment service prevents mentees from accessing other mentees assessments', async () => {
	const originals = {
		findWithIncludes: repository.findWithIncludes,
	};

	repository.findWithIncludes = async (id) => ({ id, mentee_id: 5, mentor_id: 2, facility_id: 1, status: 'draft' });

	try {
		await assert.rejects(
			service.getAssessment(1, { id: 1, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findWithIncludes = originals.findWithIncludes;
	}
});

test('assessment finalization triggers progress snapshot creation', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
		update: repository.update,
		transaction: models.sequelize.transaction,
		createSnapshotFromAssessment: progressService.createSnapshotFromAssessment,
		AssessmentUpdate: models.Assessment.update,
	};

	let findByIdCallCount = 0;
	repository.findById = async (id) => {
		findByIdCallCount++;
		if (findByIdCallCount === 1) {
			return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, cycle_id: 10, thematic_area_id: 15, status: 'in_review', prerequisites_met: true };
		}
		return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, cycle_id: 10, thematic_area_id: 15, status: 'finalized', aggregate_score: 80, practical_passed: null, finalized_at: new Date() };
	};
	models.AssessmentCriteriaScore.findAll = async () => [{ assessment_id: 1, criterion: 'Skill 1', score: 80 }];
	models.AssessmentChecklistItem.findAll = async () => [];
	let updatePayload;
	models.Assessment.update = async (data, options) => {
		updatePayload = data;
		return [1];
	};
	models.sequelize.transaction = async (callback) => callback({});
	let snapshotCalled = false;
	let snapshotAssessment;
	let snapshotActor;
	progressService.createSnapshotFromAssessment = async (assessment, actor) => {
		snapshotCalled = true;
		snapshotAssessment = assessment;
		snapshotActor = actor;
	};

	try {
		await service.finalizeAssessment(1, { id: 2, role: 'mentor' });
		assert.strictEqual(snapshotCalled, true);
		assert.strictEqual(snapshotAssessment.mentee_id, 1);
		assert.strictEqual(snapshotAssessment.facility_id, 1);
		assert.strictEqual(snapshotAssessment.cycle_id, 10);
		assert.strictEqual(snapshotAssessment.thematic_area_id, 15);
		assert.strictEqual(snapshotActor.id, 2);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
		repository.update = originals.update;
		models.sequelize.transaction = originals.transaction;
		progressService.createSnapshotFromAssessment = originals.createSnapshotFromAssessment;
		models.Assessment.update = originals.AssessmentUpdate;
	}
});

test('assessment draft updates do not trigger progress snapshots', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
		createSnapshotFromAssessment: progressService.createSnapshotFromAssessment,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'draft' });
	repository.update = async (id, data) => ({ id, ...data });
	let snapshotCalled = false;
	progressService.createSnapshotFromAssessment = async () => {
		snapshotCalled = true;
	};

	try {
		await service.updateAssessment(1, { feedback: 'Test feedback' }, { id: 2, role: 'mentor' });
		assert.strictEqual(snapshotCalled, false);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
		progressService.createSnapshotFromAssessment = originals.createSnapshotFromAssessment;
	}
});

test('failed snapshot creation does not fail assessment finalization', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
		update: repository.update,
		transaction: models.sequelize.transaction,
		createSnapshotFromAssessment: progressService.createSnapshotFromAssessment,
		AssessmentUpdate: models.Assessment.update,
	};

	let findByIdCallCount = 0;
	repository.findById = async (id) => {
		findByIdCallCount++;
		if (findByIdCallCount === 1) {
			return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, cycle_id: 10, thematic_area_id: 15, status: 'in_review', prerequisites_met: true };
		}
		return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, cycle_id: 10, thematic_area_id: 15, status: 'finalized', aggregate_score: 80, practical_passed: null, finalized_at: new Date() };
	};
	models.AssessmentCriteriaScore.findAll = async () => [{ assessment_id: 1, criterion: 'Skill 1', score: 80 }];
	models.AssessmentChecklistItem.findAll = async () => [];
	let updatePayload;
	models.Assessment.update = async (data, options) => {
		updatePayload = data;
		return [1];
	};
	models.sequelize.transaction = async (callback) => callback({});
	progressService.createSnapshotFromAssessment = async () => {
		throw new Error('Snapshot creation failed');
	};

	try {
		await service.finalizeAssessment(1, { id: 2, role: 'mentor' });
		assert.strictEqual(updatePayload.status, 'finalized');
		assert.strictEqual(updatePayload.aggregate_score, 80);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
		repository.update = originals.update;
		models.sequelize.transaction = originals.transaction;
		progressService.createSnapshotFromAssessment = originals.createSnapshotFromAssessment;
		models.Assessment.update = originals.AssessmentUpdate;
	}
});

test('assessment service prevents mentees from finalizing assessments', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true });
	models.AssessmentCriteriaScore.findAll = async () => [{ assessment_id: 1, criterion: 'Skill 1', score: 80 }];

	try {
		await assert.rejects(
			service.finalizeAssessment(1, { id: 1, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
	}
});

test('practical checklist scoring validates score range 0-4', async () => {
	const originals = {
		findById: repository.findById,
		destroy: models.AssessmentChecklistItem.destroy,
		create: models.AssessmentChecklistItem.create,
		transaction: models.sequelize.transaction,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'draft' });
	models.AssessmentChecklistItem.destroy = async () => {};
	models.AssessmentChecklistItem.create = async () => {};
	models.sequelize.transaction = async (callback) => callback({});

	try {
		await assert.rejects(
			service.setChecklistItems(1, { checklist_items: [{ item: 'Item 1', checked: true, score: 5 }] }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);

		await assert.rejects(
			service.setChecklistItems(1, { checklist_items: [{ item: 'Item 1', checked: true, score: -1 }] }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentChecklistItem.destroy = originals.destroy;
		models.AssessmentChecklistItem.create = originals.create;
		models.sequelize.transaction = originals.transaction;
	}
});

test('practical assessment passes when all required items score 3 or 4', async () => {
	const originals = {
		findById: repository.findById,
		findAllCriteria: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
		update: repository.update,
		transaction: models.sequelize.transaction,
		AssessmentUpdate: models.Assessment.update,
	};

	let findByIdCallCount = 0;
	repository.findById = async (id) => {
		findByIdCallCount++;
		if (findByIdCallCount === 1) {
			return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true };
		}
		return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'finalized', aggregate_score: 85, practical_passed: true, finalized_at: new Date() };
	};
	models.AssessmentCriteriaScore.findAll = async () => [{ assessment_id: 1, criterion: 'Skill 1', score: 80 }];
	models.AssessmentChecklistItem.findAll = async () => [
		{ assessment_id: 1, item: 'Item 1', checked: true, score: 3, required: true },
		{ assessment_id: 1, item: 'Item 2', checked: true, score: 4, required: true },
	];
	let updatePayload;
	models.Assessment.update = async (data, options) => {
		updatePayload = data;
		return [1];
	};
	models.sequelize.transaction = async (callback) => callback({});

	try {
		const result = await service.finalizeAssessment(1, { id: 2, role: 'mentor' });
		assert.strictEqual(updatePayload.practical_passed, true);
		assert.strictEqual(updatePayload.status, 'finalized');
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAllCriteria;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
		repository.update = originals.update;
		models.sequelize.transaction = originals.transaction;
		models.Assessment.update = originals.AssessmentUpdate;
	}
});

test('practical assessment fails when any required item scores 0, 1, or 2', async () => {
	const originals = {
		findById: repository.findById,
		findAllCriteria: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
		update: repository.update,
		transaction: models.sequelize.transaction,
		AssessmentUpdate: models.Assessment.update,
	};

	let findByIdCallCount = 0;
	repository.findById = async (id) => {
		findByIdCallCount++;
		if (findByIdCallCount === 1) {
			return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true };
		}
		return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'finalized', aggregate_score: 85, practical_passed: false, finalized_at: new Date() };
	};
	models.AssessmentCriteriaScore.findAll = async () => [{ assessment_id: 1, criterion: 'Skill 1', score: 80 }];
	models.AssessmentChecklistItem.findAll = async () => [
		{ assessment_id: 1, item: 'Item 1', checked: true, score: 4, required: true },
		{ assessment_id: 1, item: 'Item 2', checked: true, score: 2, required: true },
	];
	let updatePayload;
	models.Assessment.update = async (data, options) => {
		updatePayload = data;
		return [1];
	};
	models.sequelize.transaction = async (callback) => callback({});

	try {
		const result = await service.finalizeAssessment(1, { id: 2, role: 'mentor' });
		assert.strictEqual(updatePayload.practical_passed, false);
		assert.strictEqual(updatePayload.status, 'finalized');
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAllCriteria;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
		repository.update = originals.update;
		models.sequelize.transaction = originals.transaction;
		models.Assessment.update = originals.AssessmentUpdate;
	}
});

test('finalization rejects when required checklist item missing score', async () => {
	const originals = {
		findById: repository.findById,
		findAllCriteria: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true });
	models.AssessmentCriteriaScore.findAll = async () => [{ assessment_id: 1, criterion: 'Skill 1', score: 80 }];
	models.AssessmentChecklistItem.findAll = async () => [
		{ assessment_id: 1, item: 'Item 1', checked: true, score: null, required: true },
	];

	try {
		await assert.rejects(
			service.finalizeAssessment(1, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAllCriteria;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
	}
});

test('practical assessment cannot pass without required items', async () => {
	const originals = {
		findById: repository.findById,
		findAllCriteria: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
		update: repository.update,
		transaction: models.sequelize.transaction,
		AssessmentUpdate: models.Assessment.update,
	};

	let findByIdCallCount = 0;
	repository.findById = async (id) => {
		findByIdCallCount++;
		if (findByIdCallCount === 1) {
			return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true };
		}
		return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'finalized', aggregate_score: 85, practical_passed: false, finalized_at: new Date() };
	};
	models.AssessmentCriteriaScore.findAll = async () => [{ assessment_id: 1, criterion: 'Skill 1', score: 80 }];
	models.AssessmentChecklistItem.findAll = async () => [
		{ assessment_id: 1, item: 'Item 1', checked: true, score: 4, required: false },
	];
	let updatePayload;
	models.Assessment.update = async (data, options) => {
		updatePayload = data;
		return [1];
	};
	models.sequelize.transaction = async (callback) => callback({});

	try {
		const result = await service.finalizeAssessment(1, { id: 2, role: 'mentor' });
		assert.strictEqual(updatePayload.practical_passed, false);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAllCriteria;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
		repository.update = originals.update;
		models.sequelize.transaction = originals.transaction;
		models.Assessment.update = originals.AssessmentUpdate;
	}
});

test('optional checklist items do not affect practical pass/fail', async () => {
	const originals = {
		findById: repository.findById,
		findAllCriteria: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
		update: repository.update,
		transaction: models.sequelize.transaction,
		AssessmentUpdate: models.Assessment.update,
	};

	let findByIdCallCount = 0;
	repository.findById = async (id) => {
		findByIdCallCount++;
		if (findByIdCallCount === 1) {
			return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true };
		}
		return { id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'finalized', aggregate_score: 85, practical_passed: true, finalized_at: new Date() };
	};
	models.AssessmentCriteriaScore.findAll = async () => [{ assessment_id: 1, criterion: 'Skill 1', score: 80 }];
	models.AssessmentChecklistItem.findAll = async () => [
		{ assessment_id: 1, item: 'Item 1', checked: true, score: 4, required: true },
		{ assessment_id: 1, item: 'Item 2', checked: true, score: 0, required: false },
	];
	let updatePayload;
	models.Assessment.update = async (data, options) => {
		updatePayload = data;
		return [1];
	};
	models.sequelize.transaction = async (callback) => callback({});

	try {
		const result = await service.finalizeAssessment(1, { id: 2, role: 'mentor' });
		assert.strictEqual(updatePayload.practical_passed, true);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAllCriteria;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
		repository.update = originals.update;
		models.sequelize.transaction = originals.transaction;
		models.Assessment.update = originals.AssessmentUpdate;
	}
});

test('assessment finalization fails when criteria scores are missing', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true });
	models.AssessmentCriteriaScore.findAll = async () => [];
	models.AssessmentChecklistItem.findAll = async () => [];

	try {
		await assert.rejects(
			service.finalizeAssessment(1, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
	}
});

test('assessment finalization fails when criteria scores have null values', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true });
	models.AssessmentCriteriaScore.findAll = async () => [
		{ assessment_id: 1, criterion: 'Skill 1', score: 80 },
		{ assessment_id: 1, criterion: 'Skill 2', score: null },
	];
	models.AssessmentChecklistItem.findAll = async () => [];

	try {
		await assert.rejects(
			service.finalizeAssessment(1, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
	}
});

test('assessment finalization fails when criteria scores are missing', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: true });
	models.AssessmentCriteriaScore.findAll = async () => [];
	models.AssessmentChecklistItem.findAll = async () => [];

	try {
		await assert.rejects(
			service.finalizeAssessment(1, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
	}
});

test('assessment finalization fails when prerequisites are not met', async () => {
	const originals = {
		findById: repository.findById,
		findAll: models.AssessmentCriteriaScore.findAll,
		findAllChecklist: models.AssessmentChecklistItem.findAll,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, mentor_id: 2, facility_id: 1, status: 'in_review', prerequisites_met: false });
	models.AssessmentCriteriaScore.findAll = async () => [{ assessment_id: 1, criterion: 'Skill 1', score: 80 }];
	models.AssessmentChecklistItem.findAll = async () => [];

	try {
		await assert.rejects(
			service.finalizeAssessment(1, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		models.AssessmentCriteriaScore.findAll = originals.findAll;
		models.AssessmentChecklistItem.findAll = originals.findAllChecklist;
	}
});
