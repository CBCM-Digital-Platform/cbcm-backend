// src/services/analytics.service.js
const AppError = require('../errors/app-error');
const { canAccessFacility } = require('../constants/roles.constants');
const repository = require('../repositories/analytics.repository');

async function getDashboardMetrics(actor) {
	const where = {};

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin') {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		where.facility_id = actor.facility_id;
	}

	// Mentors can only see metrics for their facility
	if (actor && actor.role === 'mentor' && actor.facility_id) {
		where.facility_id = actor.facility_id;
	}

	// Mentees can only see their own metrics
	if (actor && actor.role === 'mentee') {
		return await getMenteeDashboardMetrics(actor.id);
	}

	const [
		totalUsers,
		activeUsers,
		totalMentors,
		activeMentors,
		totalMentees,
		activeMentees,
		totalAssignments,
		activeAssignments,
		totalAssessments,
		finalizedAssessments,
		totalSnapshots,
		totalFacilities,
		activeFacilities,
		totalCycles,
		activeCycles,
		totalModules,
	] = await Promise.all([
		repository.getUserCountByRole(null, where),
		repository.getActiveUserCount(null, where),
		repository.getUserCountByRole('mentor', where),
		repository.getActiveUserCount('mentor', where),
		repository.getUserCountByRole('mentee', where),
		repository.getActiveUserCount('mentee', where),
		repository.getAssignmentCount(where),
		repository.getActiveAssignmentCount(where),
		repository.getAssessmentCount(where),
		repository.getFinalizedAssessmentCount(where),
		repository.getSnapshotCount(where),
		repository.getFacilityCount(),
		repository.getActiveFacilityCount(),
		repository.getMentorshipCycleCount(),
		repository.getActiveMentorshipCycleCount(),
		repository.getLearningModuleCount(),
	]);

	return {
		users: {
			total: totalUsers,
			active: activeUsers,
			inactive: totalUsers - activeUsers,
		},
		mentors: {
			total: totalMentors,
			active: activeMentors,
		},
		mentees: {
			total: totalMentees,
			active: activeMentees,
		},
		assignments: {
			total: totalAssignments,
			active: activeAssignments,
		},
		assessments: {
			total: totalAssessments,
			finalized: finalizedAssessments,
			draft: totalAssessments - finalizedAssessments,
		},
		progress: {
			total_snapshots: totalSnapshots,
		},
		facilities: {
			total: totalFacilities,
			active: activeFacilities,
		},
		cycles: {
			total: totalCycles,
			active: activeCycles,
		},
		learning: {
			total_modules: totalModules,
		},
	};
}

async function getMenteeDashboardMetrics(menteeId) {
	const menteeWhere = { mentee_id: menteeId };

	const [totalAssignments, activeAssignments, totalAssessments, finalizedAssessments, totalSnapshots] = await Promise.all([
		repository.getAssignmentCount(menteeWhere),
		repository.getActiveAssignmentCount(menteeWhere),
		repository.getAssessmentCount(menteeWhere),
		repository.getFinalizedAssessmentCount(menteeWhere),
		repository.getSnapshotCount(menteeWhere),
	]);

	return {
		assignments: {
			total: totalAssignments,
			active: activeAssignments,
		},
		assessments: {
			total: totalAssessments,
			finalized: finalizedAssessments,
			draft: totalAssessments - finalizedAssessments,
		},
		progress: {
			total_snapshots: totalSnapshots,
		},
	};
}

async function getActivitySummary({ startDate, endDate }, actor) {
	const where = {};

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin') {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		where.facility_id = actor.facility_id;
	}

	// Mentors can only see their own activity
	if (actor && actor.role === 'mentor') {
		where.actor_id = actor.id;
	}

	// Mentees can only see their own activity
	if (actor && actor.role === 'mentee') {
		where.actor_id = actor.id;
	}

	const [totalEvents, successEvents, failureEvents, deniedEvents] = await Promise.all([
		repository.getActivityLogCountByDateRange(startDate, endDate, where),
		repository.getActivityLogCountByOutcome('success', { ...where }),
		repository.getActivityLogCountByOutcome('failure', { ...where }),
		repository.getActivityLogCountByOutcome('denied', { ...where }),
	]);

	return {
		total_events: totalEvents,
		success: successEvents,
		failure: failureEvents,
		denied: deniedEvents,
		period: {
			start: startDate || null,
			end: endDate || null,
		},
	};
}

async function getLearningProgressMetrics(actor) {
	const where = {};

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin') {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		where.facility_id = actor.facility_id;
	}

	// Mentees can only see their own progress
	if (actor && actor.role === 'mentee') {
		where.mentee_id = actor.id;
	}

	const [totalProgress, totalModules] = await Promise.all([
		repository.getLearningProgressCount(where),
		repository.getLearningModuleCount(),
	]);

	return {
		total_progress_records: totalProgress,
		total_modules: totalModules,
	};
}

module.exports = {
	getDashboardMetrics,
	getMenteeDashboardMetrics,
	getActivitySummary,
	getLearningProgressMetrics,
};
