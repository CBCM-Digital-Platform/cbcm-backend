// src/services/progress.service.js
const { sequelize } = require('../models');
const { Op } = require('sequelize');
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

async function createSnapshotFromAssessment(assessment, actor) {
	const { id: assessmentId, mentee_id, facility_id, cycle_id, thematic_area_id, aggregate_score, finalized_at } = assessment;

	// Idempotency check: look for existing snapshot for same mentee/cycle/thematic_area
	// created within 1 minute of this assessment finalization
	const existingSnapshot = await repository.findOne({
		mentee_id,
		facility_id,
		cycle_id,
		thematic_area_id,
	});

	if (existingSnapshot && finalized_at) {
		const timeDiff = Math.abs(new Date(existingSnapshot.recorded_at) - new Date(finalized_at));
		// If snapshot exists within 1 minute of finalization, consider it a duplicate
		if (timeDiff < 60000) {
			return toSnapshotResponse(existingSnapshot);
		}
	}

	// Create new snapshot directly (assessment already validated related entities)
	const snapshotPayload = {
		mentee_id,
		facility_id,
		cycle_id,
		thematic_area_id,
		score: aggregate_score,
		competency_level: null, // Business rule not defined - will be set when ranges are established
		triggered_by: actor.id,
		recorded_at: new Date(),
	};

	const snapshot = await repository.create(snapshotPayload);
	return toSnapshotResponse(snapshot);
}

async function getProgressTrends({ facilityId, cycleId, thematicAreaId, startDate, endDate }, actor) {
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

	// Date range filtering
	if (startDate) {
		where.recorded_at = { ...where.recorded_at, [Op.gte]: new Date(startDate) };
	}
	if (endDate) {
		where.recorded_at = { ...where.recorded_at, [Op.lte]: new Date(endDate) };
	}

	const snapshots = await repository.findTrends(where);

	// Group by date and calculate averages
	const trendsByDate = new Map();
	snapshots.forEach((s) => {
		const dateKey = new Date(s.recorded_at).toISOString().split('T')[0];
		if (!trendsByDate.has(dateKey)) {
			trendsByDate.set(dateKey, { date: dateKey, totalScore: 0, count: 0, snapshots: [] });
		}
		const trend = trendsByDate.get(dateKey);
		trend.totalScore += s.score || 0;
		trend.count += 1;
		trend.snapshots.push(s);
	});

	const trends = Array.from(trendsByDate.values())
		.map((t) => ({
			date: t.date,
			average_score: t.count > 0 ? Math.round((t.totalScore / t.count) * 100) / 100 : 0,
			snapshot_count: t.count,
		}))
		.sort((a, b) => a.date.localeCompare(b.date));

	return {
		trends,
		total_snapshots: snapshots.length,
		date_range: {
			start: snapshots.length > 0 ? snapshots[0].recorded_at : null,
			end: snapshots.length > 0 ? snapshots[snapshots.length - 1].recorded_at : null,
		},
	};
}

async function getMenteeProgressTrends(menteeId, { startDate, endDate }, actor) {
	const { User } = require('../models');
	const mentee = await User.findByPk(menteeId);
	if (!mentee) throw new AppError('Mentee was not found.', 404, 'MENTEE_NOT_FOUND');

	// Enforce scope: mentees can view their own trends
	if (actor) {
		if (actor.role === 'mentee' && actor.id !== menteeId) {
			throw new AppError('You can only view your own progress trends.', 403, 'FORBIDDEN');
		}
		if (actor.role === 'facility_admin' && !canAccessUser(actor, mentee)) {
			throw new AppError('You can only view progress trends for mentees within your facility.', 403, 'FORBIDDEN');
		}
	}

	const where = { mentee_id: menteeId };

	// Date range filtering
	if (startDate) {
		where.recorded_at = { ...where.recorded_at, [Op.gte]: new Date(startDate) };
	}
	if (endDate) {
		where.recorded_at = { ...where.recorded_at, [Op.lte]: new Date(endDate) };
	}

	const snapshots = await repository.findTrends(where);

	// Group by thematic area and date
	const trendsByThematicArea = new Map();
	snapshots.forEach((s) => {
		const areaKey = s.thematic_area_id || 'overall';
		const dateKey = new Date(s.recorded_at).toISOString().split('T')[0];
		const key = `${areaKey}|${dateKey}`;

		if (!trendsByThematicArea.has(key)) {
			trendsByThematicArea.set(key, {
				thematic_area_id: s.thematic_area_id,
				date: dateKey,
				score: s.score,
				competency_level: s.competency_level,
			});
		}
	});

	const trends = Array.from(trendsByThematicArea.values()).sort((a, b) => {
		if (a.thematic_area_id !== b.thematic_area_id) {
			return (a.thematic_area_id || 0) - (b.thematic_area_id || 0);
		}
		return a.date.localeCompare(b.date);
	});

	return {
		mentee_id: menteeId,
		trends,
		total_snapshots: snapshots.length,
	};
}

module.exports = {
	listSnapshots,
	getSnapshot,
	createSnapshot,
	createSnapshotFromAssessment,
	getMenteeSnapshots,
	getProgressSummary,
	getMenteeCompetencyBreakdown,
	getProgressTrends,
	getMenteeProgressTrends,
	toSnapshotResponse,
};
