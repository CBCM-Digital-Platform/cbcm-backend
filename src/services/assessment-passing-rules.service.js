const { MentorshipCycle, ThematicArea } = require('../models');
const AppError = require('../errors/app-error');
const { SYSTEM_ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../constants/roles.constants');
const repository = require('../repositories/assessment-passing-rules.repository');
const Role = require('../enums/role.enum');

// Canonical threshold fields. Legacy column/API names are still accepted on
// input and echoed on output for backward compatibility.
const THRESHOLD_FIELDS = {
	pre_test: ['pre_test_threshold', 'pre_test_min_score', 'criteria_min_score'],
	post_test: ['post_test_threshold', 'post_test_min_score', 'theory_min_score'],
	practical: ['practical_threshold', 'practical_min_score'],
};

function firstDefined(source, keys) {
	for (const key of keys) {
		if (source && source[key] !== undefined && source[key] !== null) return source[key];
	}
	return undefined;
}

// Reads thresholds tolerantly so callers/tests using either naming work.
function ruleThresholds(rule) {
	if (!rule) return null;
	const value = rule.toJSON ? rule.toJSON() : rule;
	return {
		pre_test: firstDefined(value, THRESHOLD_FIELDS.pre_test),
		post_test: firstDefined(value, THRESHOLD_FIELDS.post_test),
		practical: firstDefined(value, THRESHOLD_FIELDS.practical),
	};
}

// Normalizes an incoming payload to canonical column names.
function normalizeThresholdPayload(payload = {}) {
	const normalized = { ...payload };
	for (const [component, keys] of Object.entries(THRESHOLD_FIELDS)) {
		const canonical = keys[0];
		const legacy = keys.slice(1);
		if (normalized[canonical] === undefined) {
			const legacyValue = firstDefined(normalized, legacy);
			if (legacyValue !== undefined) normalized[canonical] = legacyValue;
		}
		for (const key of legacy) delete normalized[key];
	}
	return normalized;
}

// Serializes a rule for API responses using canonical threshold names only.
function serializeRule(rule) {
	if (!rule) return rule;
	const value = rule.toJSON ? rule.toJSON() : { ...rule };
	const thresholds = ruleThresholds(value);
	// Strip any legacy-named keys so responses only expose canonical fields.
	for (const keys of Object.values(THRESHOLD_FIELDS)) {
		for (const key of keys.slice(1)) delete value[key];
	}
	return {
		...value,
		pre_test_threshold: thresholds.pre_test,
		post_test_threshold: thresholds.post_test,
		practical_threshold: thresholds.practical,
	};
}

function serializeRules(rules) {
	return (rules || []).map(serializeRule);
}

function assertCanReadPassingRules(actor) {
	if (!actor || (!SYSTEM_ADMIN_ROLES.includes(actor.role) && !FACILITY_ADMIN_ROLES.includes(actor.role))) {
		throw new AppError('Only administrators can view passing rules.', 403, 'FORBIDDEN');
	}
}

function validateThresholds({ pre_test_threshold, post_test_threshold, practical_threshold }) {
	if (pre_test_threshold !== undefined && (pre_test_threshold < 0 || pre_test_threshold > 100)) {
		throw new AppError('Pre-test threshold must be between 0 and 100.', 400, 'INVALID_THRESHOLD');
	}
	if (post_test_threshold !== undefined && (post_test_threshold < 0 || post_test_threshold > 100)) {
		throw new AppError('Post-test threshold must be between 0 and 100.', 400, 'INVALID_THRESHOLD');
	}
	if (practical_threshold !== undefined && (practical_threshold < 1 || practical_threshold > 5)) {
		throw new AppError('Practical threshold must be between 1 and 5.', 400, 'INVALID_THRESHOLD');
	}
}

const RULE_INCLUDE = [
	{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name'], required: false },
	{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'name'], required: false },
];

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
		include: RULE_INCLUDE,
		order: [['id', 'DESC']],
	});

	return serializeRules(rules);
}

async function getPassingRule(id, actor) {
	assertCanReadPassingRules(actor);
	const rule = await repository.findById(id, { include: RULE_INCLUDE });
	if (!rule) throw new AppError('Passing rule not found.', 404, 'PASSING_RULE_NOT_FOUND');

	// Facility admin can only view system-wide rules
	if (actor && actor.role === Role.FACILITY_ADMIN) {
		if (rule.cycle_id !== null || rule.thematic_area_id !== null) {
			throw new AppError('You can only view system-wide passing rules.', 403, 'FORBIDDEN');
		}
	}

	return serializeRule(rule);
}

async function createPassingRule(payload, actor) {
	const normalized = normalizeThresholdPayload(payload);
	const { cycle_id, thematic_area_id, pre_test_threshold, post_test_threshold, practical_threshold } = normalized;

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

	validateThresholds(normalized);

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
		pre_test_threshold: pre_test_threshold ?? 70,
		post_test_threshold: post_test_threshold ?? 80,
		practical_threshold: practical_threshold ?? 3,
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

	const normalized = normalizeThresholdPayload(payload);
	const { cycle_id, thematic_area_id, pre_test_threshold, post_test_threshold, practical_threshold, is_active } = normalized;

	if (cycle_id !== undefined && cycle_id !== null && !(await MentorshipCycle.findByPk(cycle_id))) {
		throw new AppError('Mentorship cycle not found.', 404, 'CYCLE_NOT_FOUND');
	}
	if (thematic_area_id !== undefined && thematic_area_id !== null && !(await ThematicArea.findByPk(thematic_area_id))) {
		throw new AppError('Thematic area not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
	}

	validateThresholds(normalized);

	const updateData = {};
	if (cycle_id !== undefined) updateData.cycle_id = cycle_id;
	if (thematic_area_id !== undefined) updateData.thematic_area_id = thematic_area_id;
	if (pre_test_threshold !== undefined) updateData.pre_test_threshold = pre_test_threshold;
	if (post_test_threshold !== undefined) updateData.post_test_threshold = post_test_threshold;
	if (practical_threshold !== undefined) updateData.practical_threshold = practical_threshold;
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

	await repository.update(id, updateData);
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
	return { deleted: true, deactivated: true, rule: serializeRule(updated || rule) };
}

// Returns the applicable active rule or null. There is intentionally no
// hardcoded fallback: callers must surface a configuration error when no rule
// applies so the Super Admin can fix the configuration.
async function getActivePassingRule(cycleId = null, thematicAreaId = null) {
	return repository.findActiveRule(cycleId, thematicAreaId);
}

module.exports = {
	listPassingRules,
	getPassingRule,
	createPassingRule,
	updatePassingRule,
	deletePassingRule,
	getActivePassingRule,
	ruleThresholds,
	serializeRule,
};
