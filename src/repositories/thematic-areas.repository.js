// src/repositories/thematic-areas.repository.js
const { ThematicArea } = require('../models');

async function findAll(options = {}) {
	return ThematicArea.findAll(options);
}

async function findById(id) {
	return ThematicArea.findByPk(id);
}

async function findByCode(code) {
	return ThematicArea.findOne({ where: { code } });
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
	findAll,
	findById,
	findByCode,
	create,
	update,
	destroy,
	count,
};
