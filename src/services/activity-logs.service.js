// src/services/activity-logs.service.js
const { sequelize } = require('../models');
const AppError = require('../errors/app-error');
const { canAccessFacility, canAccessUser } = require('../constants/roles.constants');
const repository = require('../repositories/activity-logs.repository');

const ACTIVITY_LOG_FIELDS = ['id', 'actor_id', 'facility_id', 'action', 'entity_type', 'entity_id', 'details', 'ip_address', 'user_agent', 'created_at'];

function toActivityLogResponse(log) {
	if (!log) return null;
	const value = log.toJSON ? log.toJSON() : log;
	return Object.fromEntries(
		ACTIVITY_LOG_FIELDS.filter((field) => value[field] !== undefined).map((field) => [field, value[field]])
	);
}

function buildPagination(page = 1, limit = 20) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

async function listActivityLogs({ page = 1, limit = 20, actorId, facilityId, action, entityType, entityId, outcome, startDate, endDate }, actor) {
	const where = {};

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin') {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		where.facility_id = actor.facility_id;
	} else if (facilityId) {
		where.facility_id = facilityId;
	}

	// Mentors can only see their own activity
	if (actor && actor.role === 'mentor') {
		where.actor_id = actor.id;
	} else if (actorId) {
		where.actor_id = actorId;
	}

	// Mentees can only see their own activity
	if (actor && actor.role === 'mentee') {
		where.actor_id = actor.id;
	}

	if (action) where.action = action;
	if (entityType) where.entity_type = entityType;
	if (entityId) where.entity_id = entityId;

	// Filter by outcome in details JSON
	if (outcome) {
		where.details = { [require('sequelize').Op.like]: `%"outcome":"${outcome}"%` };
	}

	// Date range filtering
	if (startDate || endDate) {
		const { Op } = require('sequelize');
		where.created_at = {};
		if (startDate) where.created_at[Op.gte] = new Date(startDate);
		if (endDate) where.created_at[Op.lte] = new Date(endDate);
	}

	const pagination = buildPagination(page, limit);
	const { count, rows } = await repository.findMany(where, {
		order: [['created_at', 'DESC']],
		limit: pagination.limit,
		offset: pagination.offset,
	});

	return {
		items: rows ? rows.map(toActivityLogResponse) : [],
		total: count || 0,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil((count || 0) / pagination.limit)),
	};
}

async function getActivityLogById(id, actor) {
	const log = await repository.findById(id);
	if (!log) throw new AppError('Activity log not found.', 404, 'ACTIVITY_LOG_NOT_FOUND');

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin' && !canAccessFacility(actor, log.facility_id)) {
		throw new AppError('You do not have permission to access this activity log.', 403, 'FORBIDDEN');
	}

	// Mentors can only view their own logs
	if (actor && actor.role === 'mentor' && log.actor_id !== actor.id) {
		throw new AppError('You can only view your own activity logs.', 403, 'FORBIDDEN');
	}

	// Mentees can only view their own logs
	if (actor && actor.role === 'mentee' && log.actor_id !== actor.id) {
		throw new AppError('You can only view your own activity logs.', 403, 'FORBIDDEN');
	}

	return toActivityLogResponse(log);
}

module.exports = {
	listActivityLogs,
	getActivityLogById,
	toActivityLogResponse,
};
