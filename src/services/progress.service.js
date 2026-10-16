// src/services/progress.service.js
const { sequelize } = require('../models');
const AppError = require('../errors/app-error');
const { canAccessFacility, canAccessUser } = require('../constants/roles.constants');
const repository = require('../repositories/progress.repository');

const SNAPSHOT_FIELDS = ['mentee_id', 'facility_id', 'cycle_id', 'thematic_area_id', 'score', 'competency_level', 'triggered_by'];

function toSnapshotResponse(snapshot) {
	if (!snapshot) return null;
	const value = snapshot.toJSON ? snapshot.toJSON() : snapshot;
	return Object.fromEntries(
		['id', ...SNAPSHOT_FIELDS, 'recorded_at'].filter((field) => value[field] !== undefined).map((field) => [field, value[field]])
	);
}

function buildPagination(page = 1, limit = 20) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

async function listSnapshots({ page = 1, limit = 20, menteeId, facilityId, cycleId, thematicAreaId }, actor) {
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

	if (menteeId) where.mentee_id = menteeId;
	if (cycleId) where.cycle_id = cycleId;
	if (thematicAreaId) where.thematic_area_id = thematicAreaId;

	const pagination = buildPagination(page, limit);
	const { count, rows } = await repository.findMany(where, {
		order: [['recorded_at', 'DESC']],
		limit: pagination.limit,
		offset: pagination.offset,
	});

	return {
		items: rows.map(toSnapshotResponse),
		total: count,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil(count / pagination.limit)),
	};
}

async function getSnapshot(id, actor) {
	const snapshot = await repository.findById(id);
	if (!snapshot) throw new AppError('Snapshot was not found.', 404, 'SNAPSHOT_NOT_FOUND');

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin' && !canAccessFacility(actor, snapshot.facility_id)) {
		throw new AppError('You do not have permission to access this snapshot.', 403, 'FORBIDDEN');
	}

	return toSnapshotResponse(snapshot);
}

async function createSnapshot(payload, actor) {
	const { mentee_id, facility_id, cycle_id, thematic_area_id, score, competency_level } = payload;

	// Validate mentee
	const { User } = require('../models');
	const mentee = await User.findByPk(mentee_id);
	if (!mentee) throw new AppError('Mentee was not found.', 404, 'MENTEE_NOT_FOUND');
	if (mentee.role !== 'mentee') throw new AppError('Selected user is not a mentee.', 400, 'INVALID_ROLE');

	// Validate facility
	const { Facility } = require('../models');
	const facility = await Facility.findByPk(facility_id);
	if (!facility) throw new AppError('Facility was not found.', 404, 'FACILITY_NOT_FOUND');

	// Validate cycle
	const { MentorshipCycle } = require('../models');
	const cycle = await MentorshipCycle.findByPk(cycle_id);
	if (!cycle) throw new AppError('Mentorship cycle was not found.', 404, 'CYCLE_NOT_FOUND');

	// Validate thematic area if provided
	if (thematic_area_id) {
		const { ThematicArea } = require('../models');
		const thematicArea = await ThematicArea.findByPk(thematic_area_id);
		if (!thematicArea) throw new AppError('Thematic area was not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
	}

	// Validate score
	if (typeof score !== 'number' || score < 0 || score > 100) {
		throw new AppError('Score must be a number between 0 and 100.', 400, 'INVALID_SCORE');
	}

	// Enforce RBAC scope
	if (actor && actor.role === 'facility_admin') {
		if (!canAccessFacility(actor, facility_id)) {
			throw new AppError('You can only create snapshots within your authorized facility.', 403, 'FORBIDDEN');
		}
	}

	const values = Object.fromEntries(SNAPSHOT_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	values.triggered_by = actor.id;
	values.recorded_at = new Date();

	const snapshot = await sequelize.transaction((transaction) => repository.create(values, { transaction }));
	return toSnapshotResponse(snapshot);
}

async function getMenteeSnapshots(menteeId, actor) {
	const { User } = require('../models');
	const mentee = await User.findByPk(menteeId);
	if (!mentee) throw new AppError('Mentee was not found.', 404, 'MENTEE_NOT_FOUND');

	// Enforce scope: mentees can view their own snapshots
	if (actor) {
		if (actor.role === 'mentee' && actor.id !== menteeId) {
			throw new AppError('You can only view your own snapshots.', 403, 'FORBIDDEN');
		}
		if (actor.role === 'facility_admin' && !canAccessUser(actor, mentee)) {
			throw new AppError('You can only view snapshots for mentees within your facility.', 403, 'FORBIDDEN');
		}
	}

	const snapshots = await repository.findMenteeProgressHistory(menteeId);
	return snapshots.map(toSnapshotResponse);
}

async function getProgressSummary({ facilityId, cycleId, thematicAreaId }, actor) {
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

	if (cycleId) where.cycle_id = cycleId;
	if (thematicAreaId) where.thematic_area_id = thematicAreaId;

	const snapshots = await repository.findMany(where);
	const totalSnapshots = snapshots.length;
	const averageScore = totalSnapshots > 0 ? snapshots.reduce((sum, s) => sum + (s.score || 0), 0) / totalSnapshots : 0;

	// Count by competency level
	const competencyLevels = {};
	snapshots.forEach((s) => {
		const level = s.competency_level || 'unknown';
		competencyLevels[level] = (competencyLevels[level] || 0) + 1;
	});

	return {
		total_snapshots: totalSnapshots,
		average_score: Math.round(averageScore * 100) / 100,
		competency_distribution: competencyLevels,
	};
}

async function getMenteeCompetencyBreakdown(menteeId, actor) {
	const { User } = require('../models');
	const mentee = await User.findByPk(menteeId);
	if (!mentee) throw new AppError('Mentee was not found.', 404, 'MENTEE_NOT_FOUND');

	// Enforce scope
	if (actor) {
		if (actor.role === 'mentee' && actor.id !== menteeId) {
			throw new AppError('You can only view your own competency breakdown.', 403, 'FORBIDDEN');
		}
		if (actor.role === 'facility_admin' && !canAccessUser(actor, mentee)) {
			throw new AppError('You can only view competency breakdown for mentees within your facility.', 403, 'FORBIDDEN');
		}
	}

	const snapshots = await repository.findMenteeProgressHistory(menteeId);
	const latestByThematicArea = new Map();

	snapshots.forEach((s) => {
		const key = s.thematic_area_id || 'overall';
		if (!latestByThematicArea.has(key) || new Date(s.recorded_at) > new Date(latestByThematicArea.get(key).recorded_at)) {
			latestByThematicArea.set(key, s);
		}
	});

	const breakdown = Array.from(latestByThematicArea.values()).map((s) => ({
		thematic_area_id: s.thematic_area_id,
		score: s.score,
		competency_level: s.competency_level,
		recorded_at: s.recorded_at,
	}));

	return {
		mentee_id: menteeId,
		latest_competencies: breakdown,
	};
}

module.exports = {
	listSnapshots,
	getSnapshot,
	createSnapshot,
	getMenteeSnapshots,
	getProgressSummary,
	getMenteeCompetencyBreakdown,
	toSnapshotResponse,
};
