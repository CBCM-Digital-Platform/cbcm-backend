// src/repositories/thematic-areas.repository.js
const { Op, fn, col, where } = require('sequelize');
const { ThematicArea } = require('../models');

async function findAndCountAll(options = {}) {
	return ThematicArea.findAndCountAll(options);
}

async function findById(id) {
	return ThematicArea.findByPk(id);
}

async function findByCode(code) {
	return ThematicArea.findOne({ where: { code } });
}

async function findByNormalizedName(name, { excludeId, transaction } = {}) {
	const normalized = String(name || '').trim().toLowerCase();
	const nameMatch = where(fn('lower', fn('trim', col('name'))), normalized);
	const conditions = excludeId
		? { [Op.and]: [nameMatch, { id: { [Op.ne]: excludeId } }] }
		: { [Op.and]: [nameMatch] };
	return ThematicArea.findOne({ where: conditions, transaction });
}

async function create(data, options = {}) {
	return ThematicArea.create(data, options);
}

async function update(id, data, options = {}) {
	const [count] = await ThematicArea.update(data, { where: { id }, ...options });
	if (count === 0) return null;
	return findById(id);
}

async function destroy(id, options = {}) {
	const count = await ThematicArea.destroy({ where: { id }, ...options });
	return count > 0;
}

async function count(options = {}) {
	return ThematicArea.count(options);
}

module.exports = {
	findAndCountAll,
	findById,
	findByCode,
	findByNormalizedName,
	create,
	update,
	destroy,
	count,
};
