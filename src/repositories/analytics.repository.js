// src/repositories/analytics.repository.js
const { User, Assignment, Assessment, KnowledgeScoreSnapshot, LearningModuleProgress, LearningModule, Facility, MentorshipCycle } = require('../models');
const { Op } = require('sequelize');

async function getUserCountByRole(role, where = {}) {
	const filter = { ...where };
	if (role) filter.role = role;
	return User.count({ where: filter });
}

async function getActiveUserCount(role, where = {}) {
	const filter = { ...where, status: 'active' };
	if (role) filter.role = role;
	return User.count({ where: filter });
}

async function getAssignmentCount(where = {}) {
	return Assignment.count({ where });
}

async function getActiveAssignmentCount(where = {}) {
	return Assignment.count({ where: { ...where, status: 'active' } });
}

async function getAssessmentCount(where = {}) {
	return Assessment.count({ where });
}

async function getFinalizedAssessmentCount(where = {}) {
	return Assessment.count({ where: { ...where, status: 'finalized' } });
}

async function getSnapshotCount(where = {}) {
	return KnowledgeScoreSnapshot.count({ where });
}

async function getLearningModuleCount(where = {}) {
	return LearningModule.count({ where });
}

async function getLearningProgressCount(where = {}) {
	return LearningModuleProgress.count({ where });
}

async function getFacilityCount(where = {}) {
	return Facility.count({ where });
}

async function getActiveFacilityCount(where = {}) {
	// Facility model doesn't have a status column, so just return total count
	return Facility.count({ where });
}

async function getMentorshipCycleCount(where = {}) {
	// If filtering by facility_id, need to join with cycle_facilities table
	if (where.facility_id) {
		const { CycleFacility } = require('../models');
		return MentorshipCycle.count({
			where: { ...where, facility_id: undefined },
			include: [{
				model: CycleFacility,
				as: 'cycleFacilitiesForFilter',
				where: { facility_id: where.facility_id },
				required: true
			}]
		});
	}
	return MentorshipCycle.count({ where });
}

async function getActiveMentorshipCycleCount(where = {}) {
	// If filtering by facility_id, need to join with cycle_facilities table
	if (where.facility_id) {
		const { CycleFacility } = require('../models');
		return MentorshipCycle.count({
			where: { ...where, facility_id: undefined, status: 'active' },
			include: [{
				model: CycleFacility,
				as: 'cycleFacilitiesForFilter',
				where: { facility_id: where.facility_id },
				required: true
			}]
		});
	}
	return MentorshipCycle.count({ where: { ...where, status: 'active' } });
}

async function getActivityLogCount(where = {}) {
	const { ActivityLog } = require('../models');
	return ActivityLog.count({ where });
}

async function getActivityLogCountByAction(action, where = {}) {
	const { ActivityLog } = require('../models');
	return ActivityLog.count({ where: { ...where, action } });
}

async function getActivityLogCountByOutcome(outcome, where = {}) {
	const { ActivityLog, sequelize } = require('../models');
	// Build WHERE clause with JSON pattern matching for TEXT column
	const conditions = [];
	const replacements = {};
	
	if (where.actor_id) {
		conditions.push('actor_id = :actor_id');
		replacements.actor_id = where.actor_id;
	}
	if (where.facility_id) {
		conditions.push('facility_id = :facility_id');
		replacements.facility_id = where.facility_id;
	}
	if (where.action) {
		conditions.push('action = :action');
		replacements.action = where.action;
	}
	
	// Escape the outcome string for the LIKE pattern
	const escapedOutcome = outcome.replace(/'/g, "''");
	conditions.push("details LIKE '%\"outcome\":\"" + escapedOutcome + "\"%'");
	
	let whereClause = '';
	if (conditions.length > 0) {
		whereClause = `WHERE ${conditions.join(' AND ')}`;
	}
	
	const result = await sequelize.query(
		`SELECT COUNT(*) as count FROM activity_logs ${whereClause}`,
		{ 
			type: sequelize.QueryTypes.SELECT,
			replacements
		}
	);
	return result[0].count;
}

async function getActivityLogCountByDateRange(startDate, endDate, where = {}) {
	const { ActivityLog } = require('../models');
	const filter = { ...where };
	if (startDate) filter.created_at = { ...filter.created_at, [Op.gte]: new Date(startDate) };
	if (endDate) filter.created_at = { ...filter.created_at, [Op.lte]: new Date(endDate) };
	return ActivityLog.count({ where: filter });
}

module.exports = {
	getUserCountByRole,
	getActiveUserCount,
	getAssignmentCount,
	getActiveAssignmentCount,
	getAssessmentCount,
	getFinalizedAssessmentCount,
	getSnapshotCount,
	getLearningModuleCount,
	getLearningProgressCount,
	getFacilityCount,
	getActiveFacilityCount,
	getMentorshipCycleCount,
	getActiveMentorshipCycleCount,
	getActivityLogCount,
	getActivityLogCountByAction,
	getActivityLogCountByOutcome,
	getActivityLogCountByDateRange,
};
