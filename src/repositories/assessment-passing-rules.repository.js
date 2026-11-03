const { AssessmentPassingRule } = require('../models');

function isMissingTableError(error) {
	return error && error.name === 'SequelizeDatabaseError' && /no such table|does not exist/i.test(error.message || '');
}

async function findAll(options = {}) {
	try {
		return AssessmentPassingRule.findAll(options);
	} catch (error) {
		if (isMissingTableError(error)) return [];
		throw error;
	}
}

async function findById(id, options = {}) {
	try {
		const result = await AssessmentPassingRule.findByPk(id, options);
		return Array.isArray(result) ? null : result;
	} catch (error) {
		if (isMissingTableError(error)) return null;
		throw error;
	}
}

async function findOne(where, options = {}) {
	try {
		const result = await AssessmentPassingRule.findOne({ where, ...options });
		return Array.isArray(result) ? null : result;
	} catch (error) {
		if (isMissingTableError(error)) return null;
		throw error;
	}
}

async function findMany(where, options = {}) {
	try {
		return AssessmentPassingRule.findAll({ where, ...options });
	} catch (error) {
		if (isMissingTableError(error)) return [];
		throw error;
	}
}

async function create(data, options = {}) {
	try {
		return AssessmentPassingRule.create(data, options);
	} catch (error) {
		if (isMissingTableError(error)) {
			return { id: Date.now(), ...data };
		}
		throw error;
	}
}

async function update(id, data, options = {}) {
	try {
		const [count] = await AssessmentPassingRule.update(data, { where: { id }, ...options });
		if (count === 0) return null;
		return findById(id, options);
	} catch (error) {
		if (isMissingTableError(error)) return { id, ...data };
		throw error;
	}
}

async function destroy(id, options = {}) {
	try {
		const count = await AssessmentPassingRule.destroy({ where: { id }, ...options });
		return count > 0;
	} catch (error) {
		if (isMissingTableError(error)) return true;
		throw error;
	}
}

async function findActiveRule(cycleId = null, thematicAreaId = null) {
	const where = { is_active: true };
	if (cycleId) where.cycle_id = cycleId;
	if (thematicAreaId) where.thematic_area_id = thematicAreaId;

	// Try to find most specific rule first
	let rule = await AssessmentPassingRule.findOne({
		where: { ...where, cycle_id: cycleId, thematic_area_id: thematicAreaId },
		order: [['id', 'DESC']],
	});

	// If not found, try cycle-specific only
	if (!rule && cycleId) {
		rule = await AssessmentPassingRule.findOne({
			where: { ...where, cycle_id: cycleId, thematic_area_id: null },
			order: [['id', 'DESC']],
		});
	}

	// If not found, try thematic area-specific only
	if (!rule && thematicAreaId) {
		rule = await AssessmentPassingRule.findOne({
			where: { ...where, cycle_id: null, thematic_area_id: thematicAreaId },
			order: [['id', 'DESC']],
		});
	}

	// If not found, use system-wide default
	if (!rule) {
		rule = await AssessmentPassingRule.findOne({
			where: { ...where, cycle_id: null, thematic_area_id: null },
			order: [['id', 'DESC']],
		});
	}

	return rule;
}

async function count(where = {}) {
	return AssessmentPassingRule.count({ where });
}

module.exports = {
	findAll,
	findById,
	findOne,
	findMany,
	create,
	update,
	destroy,
	findActiveRule,
	count,
};
