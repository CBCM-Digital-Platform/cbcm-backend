// src/repositories/facilities.repository.js
const { Facility } = require('../models');

function list({ where, limit, offset }) {
	return Facility.findAndCountAll({
		where,
		order: [['name', 'ASC'], ['id', 'ASC']],
		limit,
		offset,
	});
}

function findById(id) {
	return Facility.findByPk(id);
}

function create(values, transaction) {
	return Facility.create(values, { transaction });
}

async function update(facility, values, transaction) {
	await facility.update(values, { transaction });
	return facility;
}

module.exports = { list, findById, create, update };
