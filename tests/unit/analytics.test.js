// tests/unit/analytics.test.js
process.env.JWT_SECRET = 'analytics-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const service = require('../../src/services/analytics.service');
const repository = require('../../src/repositories/analytics.repository');

test('dashboard metrics returns aggregate data for system admin', async () => {
	const originals = {
		getUserCountByRole: repository.getUserCountByRole,
		getActiveUserCount: repository.getActiveUserCount,
		getAssignmentCount: repository.getAssignmentCount,
		getActiveAssignmentCount: repository.getActiveAssignmentCount,
		getAssessmentCount: repository.getAssessmentCount,
		getFinalizedAssessmentCount: repository.getFinalizedAssessmentCount,
		getSnapshotCount: repository.getSnapshotCount,
		getFacilityCount: repository.getFacilityCount,
		getActiveFacilityCount: repository.getActiveFacilityCount,
		getMentorshipCycleCount: repository.getMentorshipCycleCount,
		getActiveMentorshipCycleCount: repository.getActiveMentorshipCycleCount,
		getLearningModuleCount: repository.getLearningModuleCount,
	};

	repository.getUserCountByRole = async () => 150;
	repository.getActiveUserCount = async () => 120;
	repository.getUserCountByRole = async (role) => role === 'mentor' ? 40 : role === 'mentee' ? 100 : 150;
	repository.getActiveUserCount = async (role) => role === 'mentor' ? 35 : role === 'mentee' ? 85 : 120;
	repository.getAssignmentCount = async () => 90;
	repository.getActiveAssignmentCount = async () => 75;
	repository.getAssessmentCount = async () => 200;
	repository.getFinalizedAssessmentCount = async () => 150;
	repository.getSnapshotCount = async () => 500;
	repository.getFacilityCount = async () => 10;
	repository.getActiveFacilityCount = async () => 8;
	repository.getMentorshipCycleCount = async () => 5;
	repository.getActiveMentorshipCycleCount = async () => 3;
	repository.getLearningModuleCount = async () => 25;

	try {
		const result = await service.getDashboardMetrics({ id: 1, role: 'admin' });
		assert.strictEqual(result.users.total, 150);
		assert.strictEqual(result.users.active, 120);
		assert.strictEqual(result.users.inactive, 30);
		assert.strictEqual(result.mentors.total, 40);
		assert.strictEqual(result.mentors.active, 35);
		assert.strictEqual(result.mentees.total, 100);
		assert.strictEqual(result.mentees.active, 85);
		assert.strictEqual(result.assignments.total, 90);
		assert.strictEqual(result.assignments.active, 75);
		assert.strictEqual(result.assessments.total, 200);
		assert.strictEqual(result.assessments.finalized, 150);
		assert.strictEqual(result.assessments.draft, 50);
		assert.strictEqual(result.progress.total_snapshots, 500);
		assert.strictEqual(result.facilities.total, 10);
		assert.strictEqual(result.facilities.active, 8);
		assert.strictEqual(result.cycles.total, 5);
		assert.strictEqual(result.cycles.active, 3);
		assert.strictEqual(result.learning.total_modules, 25);
	} finally {
		repository.getUserCountByRole = originals.getUserCountByRole;
		repository.getActiveUserCount = originals.getActiveUserCount;
		repository.getAssignmentCount = originals.getAssignmentCount;
		repository.getActiveAssignmentCount = originals.getActiveAssignmentCount;
		repository.getAssessmentCount = originals.getAssessmentCount;
		repository.getFinalizedAssessmentCount = originals.getFinalizedAssessmentCount;
		repository.getSnapshotCount = originals.getSnapshotCount;
		repository.getFacilityCount = originals.getFacilityCount;
		repository.getActiveFacilityCount = originals.getActiveFacilityCount;
		repository.getMentorshipCycleCount = originals.getMentorshipCycleCount;
		repository.getActiveMentorshipCycleCount = originals.getActiveMentorshipCycleCount;
		repository.getLearningModuleCount = originals.getLearningModuleCount;
	}
});

test('dashboard metrics enforces facility scope for facility admin', async () => {
	const originals = {
		getUserCountByRole: repository.getUserCountByRole,
		getActiveUserCount: repository.getActiveUserCount,
		getAssignmentCount: repository.getAssignmentCount,
		getActiveAssignmentCount: repository.getActiveAssignmentCount,
		getAssessmentCount: repository.getAssessmentCount,
		getFinalizedAssessmentCount: repository.getFinalizedAssessmentCount,
		getSnapshotCount: repository.getSnapshotCount,
		getFacilityCount: repository.getFacilityCount,
		getActiveFacilityCount: repository.getActiveFacilityCount,
		getMentorshipCycleCount: repository.getMentorshipCycleCount,
		getActiveMentorshipCycleCount: repository.getActiveMentorshipCycleCount,
		getLearningModuleCount: repository.getLearningModuleCount,
	};

	let whereUsed;
	repository.getUserCountByRole = async (role, where) => {
		whereUsed = where;
		return 50;
	};
	repository.getActiveUserCount = async () => 40;
	repository.getUserCountByRole = async (role, where) => {
		whereUsed = where;
		return role === 'mentor' ? 15 : role === 'mentee' ? 35 : 50;
	};
	repository.getActiveUserCount = async (role, where) => {
		whereUsed = where;
		return role === 'mentor' ? 12 : role === 'mentee' ? 28 : 40;
	};
	repository.getAssignmentCount = async (where) => { whereUsed = where; return 30; };
	repository.getActiveAssignmentCount = async (where) => { whereUsed = where; return 25; };
	repository.getAssessmentCount = async (where) => { whereUsed = where; return 60; };
	repository.getFinalizedAssessmentCount = async (where) => { whereUsed = where; return 45; };
	repository.getSnapshotCount = async (where) => { whereUsed = where; return 150; };
	repository.getFacilityCount = async () => 10;
	repository.getActiveFacilityCount = async () => 8;
	repository.getMentorshipCycleCount = async () => 5;
	repository.getActiveMentorshipCycleCount = async () => 3;
	repository.getLearningModuleCount = async () => 25;

	try {
		await service.getDashboardMetrics({ id: 10, role: 'facility_admin', facility_id: 5 });
		assert.strictEqual(whereUsed.facility_id, 5);
	} finally {
		repository.getUserCountByRole = originals.getUserCountByRole;
		repository.getActiveUserCount = originals.getActiveUserCount;
		repository.getAssignmentCount = originals.getAssignmentCount;
		repository.getActiveAssignmentCount = originals.getActiveAssignmentCount;
		repository.getAssessmentCount = originals.getAssessmentCount;
		repository.getFinalizedAssessmentCount = originals.getFinalizedAssessmentCount;
		repository.getSnapshotCount = originals.getSnapshotCount;
		repository.getFacilityCount = originals.getFacilityCount;
		repository.getActiveFacilityCount = originals.getActiveFacilityCount;
		repository.getMentorshipCycleCount = originals.getMentorshipCycleCount;
		repository.getActiveMentorshipCycleCount = originals.getActiveMentorshipCycleCount;
		repository.getLearningModuleCount = originals.getLearningModuleCount;
	}
});

test('dashboard metrics rejects facility admin without facility assignment', async () => {
	try {
		await assert.rejects(
			service.getDashboardMetrics({ id: 10, role: 'facility_admin', facility_id: null }),
			{ statusCode: 403 }
		);
	} catch (error) {
		assert.fail('Should have thrown');
	}
});

test('dashboard metrics returns mentee-specific data for mentees', async () => {
	const originals = {
		getAssignmentCount: repository.getAssignmentCount,
		getActiveAssignmentCount: repository.getActiveAssignmentCount,
		getAssessmentCount: repository.getAssessmentCount,
		getFinalizedAssessmentCount: repository.getFinalizedAssessmentCount,
		getSnapshotCount: repository.getSnapshotCount,
	};

	repository.getAssignmentCount = async (where) => { assert.strictEqual(where.mentee_id, 25); return 3; };
	repository.getActiveAssignmentCount = async (where) => { assert.strictEqual(where.mentee_id, 25); return 2; };
	repository.getAssessmentCount = async (where) => { assert.strictEqual(where.mentee_id, 25); return 10; };
	repository.getFinalizedAssessmentCount = async (where) => { assert.strictEqual(where.mentee_id, 25); return 7; };
	repository.getSnapshotCount = async (where) => { assert.strictEqual(where.mentee_id, 25); return 15; };

	try {
		const result = await service.getDashboardMetrics({ id: 25, role: 'mentee' });
		assert.strictEqual(result.assignments.total, 3);
		assert.strictEqual(result.assignments.active, 2);
		assert.strictEqual(result.assessments.total, 10);
		assert.strictEqual(result.assessments.finalized, 7);
		assert.strictEqual(result.assessments.draft, 3);
		assert.strictEqual(result.progress.total_snapshots, 15);
	} finally {
		repository.getAssignmentCount = originals.getAssignmentCount;
		repository.getActiveAssignmentCount = originals.getActiveAssignmentCount;
		repository.getAssessmentCount = originals.getAssessmentCount;
		repository.getFinalizedAssessmentCount = originals.getFinalizedAssessmentCount;
		repository.getSnapshotCount = originals.getSnapshotCount;
	}
});

test('activity summary returns event counts by outcome', async () => {
	const originals = {
		getActivityLogCountByDateRange: repository.getActivityLogCountByDateRange,
		getActivityLogCountByOutcome: repository.getActivityLogCountByOutcome,
	};

	repository.getActivityLogCountByDateRange = async () => 1000;
	repository.getActivityLogCountByOutcome = async (outcome) => outcome === 'success' ? 850 : outcome === 'failure' ? 100 : 50;

	try {
		const result = await service.getActivitySummary({}, { id: 1, role: 'admin' });
		assert.strictEqual(result.total_events, 1000);
		assert.strictEqual(result.success, 850);
		assert.strictEqual(result.failure, 100);
		assert.strictEqual(result.denied, 50);
	} finally {
		repository.getActivityLogCountByDateRange = originals.getActivityLogCountByDateRange;
		repository.getActivityLogCountByOutcome = originals.getActivityLogCountByOutcome;
	}
});

test('activity summary restricts mentors to their own activity', async () => {
	const originals = {
		getActivityLogCountByDateRange: repository.getActivityLogCountByDateRange,
		getActivityLogCountByOutcome: repository.getActivityLogCountByOutcome,
	};

	let whereUsed;
	repository.getActivityLogCountByDateRange = async (where) => { whereUsed = where; return 50; };
	repository.getActivityLogCountByOutcome = async (outcome, where) => { whereUsed = where; return outcome === 'success' ? 45 : 5; };

	try {
		await service.getActivitySummary({}, { id: 15, role: 'mentor' });
		assert.strictEqual(whereUsed.actor_id, 15);
	} finally {
		repository.getActivityLogCountByDateRange = originals.getActivityLogCountByDateRange;
		repository.getActivityLogCountByOutcome = originals.getActivityLogCountByOutcome;
	}
});

test('activity summary restricts mentees to their own activity', async () => {
	const originals = {
		getActivityLogCountByDateRange: repository.getActivityLogCountByDateRange,
		getActivityLogCountByOutcome: repository.getActivityLogCountByOutcome,
	};

	let whereUsed;
	repository.getActivityLogCountByDateRange = async (where) => { whereUsed = where; return 30; };
	repository.getActivityLogCountByOutcome = async (outcome, where) => { whereUsed = where; return outcome === 'success' ? 28 : 2; };

	try {
		await service.getActivitySummary({}, { id: 20, role: 'mentee' });
		assert.strictEqual(whereUsed.actor_id, 20);
	} finally {
		repository.getActivityLogCountByDateRange = originals.getActivityLogCountByDateRange;
		repository.getActivityLogCountByOutcome = originals.getActivityLogCountByOutcome;
	}
});

test('learning progress metrics returns module and progress counts', async () => {
	const originals = {
		getLearningProgressCount: repository.getLearningProgressCount,
		getLearningModuleCount: repository.getLearningModuleCount,
	};

	repository.getLearningProgressCount = async () => 500;
	repository.getLearningModuleCount = async () => 25;

	try {
		const result = await service.getLearningProgressMetrics({ id: 1, role: 'admin' });
		assert.strictEqual(result.total_progress_records, 500);
		assert.strictEqual(result.total_modules, 25);
	} finally {
		repository.getLearningProgressCount = originals.getLearningProgressCount;
		repository.getLearningModuleCount = originals.getLearningModuleCount;
	}
});

test('learning progress restricts mentees to their own progress', async () => {
	const originals = {
		getLearningProgressCount: repository.getLearningProgressCount,
		getLearningModuleCount: repository.getLearningModuleCount,
	};

	let whereUsed;
	repository.getLearningProgressCount = async (where) => { whereUsed = where; return 15; };
	repository.getLearningModuleCount = async () => 25;

	try {
		await service.getLearningProgressMetrics({ id: 25, role: 'mentee' });
		assert.strictEqual(whereUsed.mentee_id, 25);
	} finally {
		repository.getLearningProgressCount = originals.getLearningProgressCount;
		repository.getLearningModuleCount = originals.getLearningModuleCount;
	}
});
