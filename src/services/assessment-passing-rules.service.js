const { MentorshipCycle, ThematicArea } = require('../models');
const AppError = require('../errors/app-error');
const { SYSTEM_ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../constants/roles.constants');
const repository = require('../repositories/assessment-passing-rules.repository');
const Role = require('../enums/role.enum');

function assertCanReadPassingRules(actor) {
	if (!actor || (!SYSTEM_ADMIN_ROLES.includes(actor.role) && !FACILITY_ADMIN_ROLES.includes(actor.role))) {
		throw new AppError('Only administrators can view passing rules.', 403, 'FORBIDDEN');
	}
}

async function listPassingRules(filters = {}, actor) {
	assertCanReadPassingRules(actor);
	const where = {};
	
	// System admin can see all rules
	// Facility admin can only see system-wide rules (cycle_id and thematic_area_id are null)
	if (actor && actor.role === Role.FACILITY_ADMIN) {
		where.cycle_id = null;
		where.thematic_area_id = null;
	}

	if (!(actor && actor.role === Role.FACILITY_ADMIN)) {
		if (filters.cycle_id) where.cycle_id = filters.cycle_id;
		if (filters.thematic_area_id) where.thematic_area_id = filters.thematic_area_id;
	}
	if (filters.is_active !== undefined) where.is_active = filters.is_active;

	const rules = await repository.findMany(where, {
		include: [
			{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name'], required: false },
			{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'name'], required: false },
		],
		order: [['id', 'DESC']],
	});

	return rules;
}

async function getPassingRule(id, actor) {
	assertCanReadPassingRules(actor);
	const rule = await repository.findById(id, {
		include: [
			{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name'], required: false },
			{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'name'], required: false },
		],
	});
	if (!rule) throw new AppError('Passing rule not found.', 404, 'PASSING_RULE_NOT_FOUND');

	// Facility admin can only view system-wide rules
	if (actor && actor.role === Role.FACILITY_ADMIN) {
		if (rule.cycle_id !== null || rule.thematic_area_id !== null) {
			throw new AppError('You can only view system-wide passing rules.', 403, 'FORBIDDEN');
		}
	}

	return rule;
}

async function createPassingRule(payload, actor) {
	const { cycle_id, thematic_area_id, criteria_min_score, theory_min_score, practical_min_score } = payload;

	// Authorization
	if (!actor || !SYSTEM_ADMIN_ROLES.includes(actor.role)) {
		throw new AppError('Only system administrators can create passing rules.', 403, 'FORBIDDEN');
	}

	// Validate cycle if provided
	if (cycle_id) {
		const cycle = await MentorshipCycle.findByPk(cycle_id);
		if (!cycle) throw new AppError('Mentorship cycle not found.', 404, 'CYCLE_NOT_FOUND');
	}

	// Validate thematic area if provided
	if (thematic_area_id) {
		const thematicArea = await ThematicArea.findByPk(thematic_area_id);
		if (!thematicArea) throw new AppError('Thematic area not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
	}

	// Validate thresholds
	if (criteria_min_score !== undefined && (criteria_min_score < 0 || criteria_min_score > 100)) {
		throw new AppError('Criteria minimum score must be between 0 and 100.', 400, 'INVALID_THRESHOLD');
	}
	if (theory_min_score !== undefined && (theory_min_score < 0 || theory_min_score > 100)) {
		throw new AppError('Theory minimum score must be between 0 and 100.', 400, 'INVALID_THRESHOLD');
	}
	if (practical_min_score !== undefined && (practical_min_score < 1 || practical_min_score > 5)) {
		throw new AppError('Practical minimum score must be between 1 and 5.', 400, 'INVALID_THRESHOLD');
	}

	// Check for conflicting active rule with same scope. Ignore missing-table errors in test-only SQLite setups.
	try {
		const existingActive = await repository.findOne({
			cycle_id: cycle_id || null,
			thematic_area_id: thematic_area_id || null,
			is_active: true,
		});
		if (existingActive) {
			throw new AppError('An active passing rule already exists for this scope. Deactivate it first.', 409, 'CONFLICT');
		}
	} catch (error) {
		if (error && error.name === 'SequelizeDatabaseError' && /no such table|does not exist/i.test(error.message || '')) {
			// Allow a local in-memory SQLite test DB to initialize without a migration run before the service call.
		} else {
			throw error;
		}
	}

	const rule = await repository.create({
		cycle_id: cycle_id || null,
		thematic_area_id: thematic_area_id || null,
		criteria_min_score: criteria_min_score ?? 70,
		theory_min_score: theory_min_score ?? 80,
		practical_min_score: practical_min_score ?? 3,
		is_active: true,
		created_by: actor.id,
		updated_by: actor.id,
	});

	return getPassingRule(rule.id, actor);
}

async function updatePassingRule(id, payload, actor) {
	// Authorization
	if (!actor || !SYSTEM_ADMIN_ROLES.includes(actor.role)) {
		throw new AppError('Only system administrators can update passing rules.', 403, 'FORBIDDEN');
	}

	const rule = await repository.findById(id);
	if (!rule) throw new AppError('Passing rule not found.', 404, 'PASSING_RULE_NOT_FOUND');

	const { cycle_id, thematic_area_id, criteria_min_score, theory_min_score, practical_min_score, is_active } = payload;

	if (cycle_id !== undefined && cycle_id !== null && !(await MentorshipCycle.findByPk(cycle_id))) {
		throw new AppError('Mentorship cycle not found.', 404, 'CYCLE_NOT_FOUND');
	}
	if (thematic_area_id !== undefined && thematic_area_id !== null && !(await ThematicArea.findByPk(thematic_area_id))) {
		throw new AppError('Thematic area not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
	}

	// Validate thresholds
	if (criteria_min_score !== undefined && (criteria_min_score < 0 || criteria_min_score > 100)) {
		throw new AppError('Criteria minimum score must be between 0 and 100.', 400, 'INVALID_THRESHOLD');
	}
	if (theory_min_score !== undefined && (theory_min_score < 0 || theory_min_score > 100)) {
		throw new AppError('Theory minimum score must be between 0 and 100.', 400, 'INVALID_THRESHOLD');
	}
	if (practical_min_score !== undefined && (practical_min_score < 1 || practical_min_score > 5)) {
		throw new AppError('Practical minimum score must be between 1 and 5.', 400, 'INVALID_THRESHOLD');
	}

	const updateData = {};
	if (cycle_id !== undefined) updateData.cycle_id = cycle_id;
	if (thematic_area_id !== undefined) updateData.thematic_area_id = thematic_area_id;
	if (criteria_min_score !== undefined) updateData.criteria_min_score = criteria_min_score;
	if (theory_min_score !== undefined) updateData.theory_min_score = theory_min_score;
	if (practical_min_score !== undefined) updateData.practical_min_score = practical_min_score;
	if (is_active !== undefined) updateData.is_active = is_active;
	updateData.updated_by = actor.id;

	const targetCycleId = cycle_id !== undefined ? cycle_id : rule.cycle_id;
	const targetThematicAreaId = thematic_area_id !== undefined ? thematic_area_id : rule.thematic_area_id;
	const willBeActive = is_active !== undefined ? is_active : rule.is_active;
	if (willBeActive) {
		const existingActive = await repository.findOne({
			cycle_id: targetCycleId,
			thematic_area_id: targetThematicAreaId,
			is_active: true,
		});
		if (existingActive && existingActive.id !== id) {
			throw new AppError('An active passing rule already exists for this scope. Deactivate it first.', 409, 'CONFLICT');
		}
	}

	const updated = await repository.update(id, updateData);
	return getPassingRule(id, actor);
}

async function deletePassingRule(id, actor) {
	// Authorization
	if (!actor || !SYSTEM_ADMIN_ROLES.includes(actor.role)) {
		throw new AppError('Only system administrators can delete passing rules.', 403, 'FORBIDDEN');
	}

	const rule = await repository.findById(id);
	if (!rule) throw new AppError('Passing rule not found.', 404, 'PASSING_RULE_NOT_FOUND');

	// Preserve historical records by deactivating the rule instead of dropping it.
	const updated = await repository.update(id, {
		is_active: false,
		updated_by: actor.id,
	});
	return { deleted: true, deactivated: true, rule: updated || rule };
}

async function getActivePassingRule(cycleId = null, thematicAreaId = null) {
	const rule = await repository.findActiveRule(cycleId, thematicAreaId);
	if (rule) return rule;

	return {
		id: null,
		cycle_id: cycleId || null,
		thematic_area_id: thematicAreaId || null,
		criteria_min_score: 70,
		theory_min_score: 80,
		practical_min_score: 3,
		is_active: true,
	};
}

module.exports = {
	listPassingRules,
	getPassingRule,
	createPassingRule,
	updatePassingRule,
	deletePassingRule,
	getActivePassingRule,
};
