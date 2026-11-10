// src/services/thematic-areas.service.js
const { sequelize } = require('../models');
const AppError = require('../errors/app-error');
const repository = require('../repositories/thematic-areas.repository');

const THEMATIC_AREA_FIELDS = ['code', 'name'];

function toThematicAreaResponse(thematicArea) {
	if (!thematicArea) return null;
	const value = thematicArea.toJSON ? thematicArea.toJSON() : thematicArea;
	return Object.fromEntries(
		['id', ...THEMATIC_AREA_FIELDS].filter((field) => value[field] !== undefined).map((field) => [field, value[field]])
	);
}

function buildPagination(page = 1, limit = 20) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

async function listThematicAreas({ page = 1, limit = 20 } = {}) {
	const pagination = buildPagination(page, limit);
	const { count, rows } = await repository.findAndCountAll({
		limit: pagination.limit,
		offset: pagination.offset,
		order: [['id', 'ASC']],
	});
	return {
		items: rows.map(toThematicAreaResponse),
		total: count,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil(count / pagination.limit)),
	};
}

async function getThematicArea(id) {
	const thematicArea = await repository.findById(id);
	if (!thematicArea) throw new AppError('Thematic area was not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
	return toThematicAreaResponse(thematicArea);
}

async function createThematicArea(payload, actorId) {
	const code = String(payload.code || '').trim();
	const name = String(payload.name || '').trim();
	if (!code) throw new AppError('Thematic area code is required.', 400, 'VALIDATION_ERROR');
	if (!name) throw new AppError('Thematic area name is required.', 400, 'VALIDATION_ERROR');

	const existing = await repository.findByCode(code);
	if (existing) throw new AppError('A thematic area with this code already exists.', 409, 'THEMATIC_AREA_EXISTS');

	const values = Object.fromEntries(THEMATIC_AREA_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	values.code = code;
	values.name = name;

	const thematicArea = await sequelize.transaction((transaction) => repository.create(values, { transaction }));
	return toThematicAreaResponse(thematicArea);
}

async function updateThematicArea(id, payload, actorId) {
	const thematicArea = await repository.findById(id);
	if (!thematicArea) throw new AppError('Thematic area was not found.', 404, 'THEMATIC_AREA_NOT_FOUND');

	const values = Object.fromEntries(THEMATIC_AREA_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	if (!Object.keys(values).length) throw new AppError('At least one editable field is required.', 400, 'VALIDATION_ERROR');

	if (values.code !== undefined) {
		values.code = String(values.code).trim();
		if (!values.code) throw new AppError('Thematic area code cannot be empty.', 400, 'VALIDATION_ERROR');
		const existing = await repository.findByCode(values.code);
		if (existing && existing.id !== id) throw new AppError('A thematic area with this code already exists.', 409, 'THEMATIC_AREA_EXISTS');
	}
	if (values.name !== undefined) {
		values.name = String(values.name).trim();
		if (!values.name) throw new AppError('Thematic area name cannot be empty.', 400, 'VALIDATION_ERROR');
	}

	const updated = await sequelize.transaction((transaction) => repository.update(id, values, { transaction }));
	return toThematicAreaResponse(updated);
}

async function deleteThematicArea(id, actorId) {
	const thematicArea = await repository.findById(id);
	if (!thematicArea) throw new AppError('Thematic area was not found.', 404, 'THEMATIC_AREA_NOT_FOUND');

	// Check if thematic area is referenced by cycles
	const { CycleThematicArea } = require('../models');
	const cycleUsage = await CycleThematicArea.count({ where: { thematic_area_id: id } });
	if (cycleUsage > 0) {
		throw new AppError('Cannot delete thematic area: it is assigned to one or more mentorship cycles.', 409, 'THEMATIC_AREA_IN_USE');
	}

	// Check if thematic area is referenced by assignments
	const { Assignment } = require('../models');
	const assignmentUsage = await Assignment.count({ where: { thematic_area_id: id } });
	if (assignmentUsage > 0) {
		throw new AppError('Cannot delete thematic area: it is referenced by assignments.', 409, 'THEMATIC_AREA_IN_USE');
	}

	await sequelize.transaction((transaction) => repository.destroy(id, { transaction }));
	return { deleted: true };
}

module.exports = {
	listThematicAreas,
	getThematicArea,
	createThematicArea,
	updateThematicArea,
	deleteThematicArea,
	toThematicAreaResponse,
};
