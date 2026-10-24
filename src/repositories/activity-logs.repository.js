// src/repositories/activity-logs.repository.js
const { ActivityLog } = require('../models');

async function findAll(options = {}) {
	return ActivityLog.findAll(options);
}

async function findById(id, options = {}) {
	return ActivityLog.findByPk(id, options);
}

async function findOne(where, options = {}) {
	return ActivityLog.findOne({ where, ...options });
}

async function findMany(where, options = {}) {
	const result = await ActivityLog.findAndCountAll({ where, ...options });
	return { count: result.count, rows: result.rows };
}

async function count(where = {}) {
	return ActivityLog.count({ where });
}

async function findByActor(actorId, options = {}) {
	return findMany({ actor_id: actorId }, options);
}

async function findByFacility(facilityId, options = {}) {
	return findMany({ facility_id: facilityId }, options);
}

async function findByEntityType(entityType, options = {}) {
	return findMany({ entity_type: entityType }, options);
}

async function findByAction(action, options = {}) {
	return findMany({ action }, options);
}

async function findByDateRange(startDate, endDate, options = {}) {
	const { Op } = require('sequelize');
	const where = {};
	if (startDate) where.created_at = { ...where.created_at, [Op.gte]: new Date(startDate) };
	if (endDate) where.created_at = { ...where.created_at, [Op.lte]: new Date(endDate) };
	return findMany(where, options);
}

module.exports = {
	findAll,
	findById,
	findOne,
	findMany,
	count,
	findByActor,
	findByFacility,
	findByEntityType,
	findByAction,
	findByDateRange,
};
