// src/services/facilities.service.js
const { sequelize } = require('../models');
const AppError = require('../errors/app-error');
const repository = require('../repositories/facilities.repository');

const FACILITY_FIELDS = ['name', 'type', 'level', 'region', 'zone', 'woreda', 'kebele', 'street_address', 'contact_info'];

function toFacilityResponse(facility) {
	if (!facility) return null;
	const value = facility.toJSON ? facility.toJSON() : facility;
	return Object.fromEntries([
		'id', ...FACILITY_FIELDS, 'created_at', 'updated_at',
	].filter((field) => value[field] !== undefined).map((field) => [field, value[field]]));
}

function buildPagination(page = 1, limit = 20) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

async function listFacilities({ page = 1, limit = 20, type, level, region, zone, woreda } = {}) {
	const where = Object.fromEntries(Object.entries({ type, level, region, zone, woreda }).filter(([, value]) => value !== undefined));
	const pagination = buildPagination(page, limit);
	const { count, rows } = await repository.list({ where, limit: pagination.limit, offset: pagination.offset });
	return {
		items: rows.map(toFacilityResponse),
		total: count,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil(count / pagination.limit)),
	};
}

async function getFacility(id) {
	const facility = await repository.findById(id);
	if (!facility) throw new AppError('Facility was not found.', 404, 'FACILITY_NOT_FOUND');
	return toFacilityResponse(facility);
}

async function createFacility(payload, actorId) {
	const name = String(payload.name || '').trim();
	const type = String(payload.type || '').trim();
	if (!name || !type) throw new AppError('Facility name and type are required.', 400, 'VALIDATION_ERROR');
	const values = Object.fromEntries(FACILITY_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	values.name = name;
	values.type = type;
	values.created_by = actorId;
	const facility = await sequelize.transaction((transaction) => repository.create(values, transaction));
	return toFacilityResponse(facility);
}

async function updateFacility(id, payload, actorId) {
	const facility = await repository.findById(id);
	if (!facility) throw new AppError('Facility was not found.', 404, 'FACILITY_NOT_FOUND');
	const values = Object.fromEntries(FACILITY_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	if (!Object.keys(values).length) throw new AppError('At least one editable facility field is required.', 400, 'VALIDATION_ERROR');
	if (values.name !== undefined) values.name = String(values.name).trim();
	if (values.type !== undefined) values.type = String(values.type).trim();
	if (Object.values(values).some((value) => typeof value === 'string' && !value.trim())) {
		throw new AppError('Facility fields cannot be empty.', 400, 'VALIDATION_ERROR');
	}
	values.updated_by = actorId;
	const updated = await sequelize.transaction((transaction) => repository.update(facility, values, transaction));
	return toFacilityResponse(updated);
}

module.exports = { listFacilities, getFacility, createFacility, updateFacility, toFacilityResponse };
