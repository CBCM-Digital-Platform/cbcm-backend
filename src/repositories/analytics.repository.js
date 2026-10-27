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
	return Facility.count({ where: { ...where, status: 'active' } });
}

async function getMentorshipCycleCount(where = {}) {
	return MentorshipCycle.count({ where });
}

async function getActiveMentorshipCycleCount(where = {}) {
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
	const { ActivityLog } = require('../models');
	return ActivityLog.count({ where: { ...where, details: { [Op.like]: `%"outcome":"${outcome}"%` } } });
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
