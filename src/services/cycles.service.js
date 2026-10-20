// src/services/cycles.service.js
const { Facility, ThematicArea, sequelize } = require('../models');
const AppError = require('../errors/app-error');
const CycleStatus = require('../enums/cycle-status.enum');
const { canAccessFacility } = require('../constants/roles.constants');
const repository = require('../repositories/cycles.repository');

const CYCLE_FIELDS = ['name', 'start_date', 'end_date'];
const transitions = Object.freeze({
	[CycleStatus.DRAFT]: [CycleStatus.PLANNED, CycleStatus.CANCELLED],
	[CycleStatus.PLANNED]: [CycleStatus.ACTIVE, CycleStatus.CANCELLED],
	[CycleStatus.ACTIVE]: [CycleStatus.COMPLETED, CycleStatus.CANCELLED],
	[CycleStatus.COMPLETED]: [],
	[CycleStatus.CANCELLED]: [],
});

function toCycleResponse(cycle) {
	if (!cycle) return null;
	const value = cycle.toJSON ? cycle.toJSON() : cycle;
	return Object.fromEntries([
		'id', 'name', 'status', 'start_date', 'end_date', 'created_at', 'updated_at',
	].filter((field) => value[field] !== undefined).map((field) => [field, value[field]]));
}

function validateDateRange(startDate, endDate) {
	if (startDate && endDate && startDate > endDate) {
		throw new AppError('Cycle end_date must not be before start_date.', 400, 'INVALID_DATE_RANGE');
	}
}

function paginationValues(page = 1, limit = 20) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

async function listCycles({ page = 1, limit = 20, status } = {}) {
	const where = status ? { status } : {};
	const pagination = paginationValues(page, limit);
	const { count, rows } = await repository.list({ where, limit: pagination.limit, offset: pagination.offset });
	return {
		items: rows.map(toCycleResponse),
		total: count,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil(count / pagination.limit)),
	};
}

async function getCycle(id) {
	const cycle = await repository.findById(id);
	if (!cycle) throw new AppError('Mentorship cycle was not found.', 404, 'CYCLE_NOT_FOUND');
	return toCycleResponse(cycle);
}

async function createCycle(payload, actorId) {
	const name = String(payload.name || '').trim();
	if (!name) throw new AppError('Cycle name is required.', 400, 'VALIDATION_ERROR');
	validateDateRange(payload.start_date, payload.end_date);
	const values = Object.fromEntries(CYCLE_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	values.name = name;
	values.status = CycleStatus.DRAFT;
	values.created_by = actorId;
	const cycle = await sequelize.transaction((transaction) => repository.create(values, transaction));
	return toCycleResponse(cycle);
}

async function updateCycle(id, payload, actorId) {
	const cycle = await repository.findById(id);
	if (!cycle) throw new AppError('Mentorship cycle was not found.', 404, 'CYCLE_NOT_FOUND');
	const values = Object.fromEntries(CYCLE_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	if (!Object.keys(values).length) throw new AppError('At least one editable cycle field is required.', 400, 'VALIDATION_ERROR');
	if (values.name !== undefined) values.name = String(values.name).trim();
	if (values.name !== undefined && !values.name) throw new AppError('Cycle name cannot be empty.', 400, 'VALIDATION_ERROR');
	const startDate = values.start_date !== undefined ? values.start_date : cycle.start_date;
	const endDate = values.end_date !== undefined ? values.end_date : cycle.end_date;
	validateDateRange(startDate, endDate);
	if (cycle.status === CycleStatus.ACTIVE && (!startDate || !endDate)) {
		throw new AppError('An active cycle must retain both start_date and end_date.', 400, 'CYCLE_DATES_REQUIRED');
	}
	values.updated_by = actorId;
	const updated = await sequelize.transaction((transaction) => repository.update(cycle, values, transaction));
	return toCycleResponse(updated);
}

async function updateCycleStatus(id, nextStatus, actorId) {
	let result;
	await sequelize.transaction(async (transaction) => {
		const cycle = await repository.findById(id, { transaction });
		if (!cycle) throw new AppError('Mentorship cycle was not found.', 404, 'CYCLE_NOT_FOUND');
		const currentStatus = cycle.status || CycleStatus.DRAFT;
		if (!transitions[currentStatus]?.includes(nextStatus)) {
			throw new AppError(`Cycle status cannot transition from ${currentStatus} to ${nextStatus}.`, 400, 'INVALID_STATUS_TRANSITION');
		}
		if (nextStatus === CycleStatus.ACTIVE && (!cycle.start_date || !cycle.end_date)) {
			throw new AppError('A cycle must have start_date and end_date before activation.', 400, 'CYCLE_DATES_REQUIRED');
		}
		const [updatedCount] = await repository.updateStatusIfCurrent(id, cycle.status, nextStatus, actorId, transaction);
		if (!updatedCount) throw new AppError('Cycle status changed concurrently; reload and retry.', 409, 'CYCLE_STATUS_CONFLICT');
		result = toCycleResponse(await repository.findById(id, { transaction }));
	});
	return result;
}

async function requireCycle(id) {
	const cycle = await repository.findById(id);
	if (!cycle) throw new AppError('Mentorship cycle was not found.', 404, 'CYCLE_NOT_FOUND');
	return cycle;
}

async function listCycleFacilities(cycleId) {
	await requireCycle(cycleId);
	return (await repository.listFacilities(cycleId)).map((assignment) => ({
		id: assignment.facility.id,
		name: assignment.facility.name,
		type: assignment.facility.type,
		level: assignment.facility.level,
		region: assignment.facility.region,
		zone: assignment.facility.zone,
		woreda: assignment.facility.woreda,
		kebele: assignment.facility.kebele,
		street_address: assignment.facility.street_address,
		contact_info: assignment.facility.contact_info,
	}));
}

async function assignFacility(cycleId, facilityId, actorId, actor) {
	await requireCycle(cycleId);
	if (!(await Facility.findByPk(facilityId))) throw new AppError('Facility was not found.', 404, 'FACILITY_NOT_FOUND');

	// Enforce facility scope for Facility Admin
	if (actor && !canAccessFacility(actor, facilityId)) {
		throw new AppError('You do not have permission to assign this facility.', 403, 'FORBIDDEN');
	}

	if (await repository.findFacilityAssignment(cycleId, facilityId)) {
		throw new AppError('Facility is already assigned to this cycle.', 409, 'CYCLE_FACILITY_EXISTS');
	}
	try {
		await sequelize.transaction((transaction) => repository.createFacilityAssignment({
			cycle_id: cycleId,
			facility_id: facilityId,
			created_by: actorId,
		}, transaction));
	} catch (error) {
		if (error.name === 'SequelizeUniqueConstraintError') throw new AppError('Facility is already assigned to this cycle.', 409, 'CYCLE_FACILITY_EXISTS');
		throw error;
	}
	return { cycle_id: Number(cycleId), facility_id: Number(facilityId), assigned: true };
}

async function removeFacility(cycleId, facilityId, actor) {
	await requireCycle(cycleId);

	// Enforce facility scope for Facility Admin
	if (actor && !canAccessFacility(actor, facilityId)) {
		throw new AppError('You do not have permission to remove this facility.', 403, 'FORBIDDEN');
	}

	const removed = await sequelize.transaction((transaction) => repository.removeFacilityAssignment(cycleId, facilityId, transaction));
	if (!removed) throw new AppError('Facility assignment was not found for this cycle.', 404, 'CYCLE_FACILITY_NOT_FOUND');
	return { cycle_id: Number(cycleId), facility_id: Number(facilityId), removed: true };
}

async function listCycleThematicAreas(cycleId) {
	await requireCycle(cycleId);
	return (await repository.listThematicAreas(cycleId)).map((assignment) => ({
		id: assignment.thematicArea.id,
		code: assignment.thematicArea.code,
		name: assignment.thematicArea.name,
	}));
}

async function assignThematicArea(cycleId, thematicAreaId, actorId) {
	await requireCycle(cycleId);
	if (!(await ThematicArea.findByPk(thematicAreaId))) throw new AppError('Thematic area was not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
	if (await repository.findThematicAreaAssignment(cycleId, thematicAreaId)) {
		throw new AppError('Thematic area is already assigned to this cycle.', 409, 'CYCLE_THEMATIC_AREA_EXISTS');
	}
	try {
		await sequelize.transaction((transaction) => repository.createThematicAreaAssignment({
			cycle_id: cycleId,
			thematic_area_id: thematicAreaId,
			created_by: actorId,
		}, transaction));
	} catch (error) {
		if (error.name === 'SequelizeUniqueConstraintError') throw new AppError('Thematic area is already assigned to this cycle.', 409, 'CYCLE_THEMATIC_AREA_EXISTS');
		throw error;
	}
	return { cycle_id: Number(cycleId), thematic_area_id: Number(thematicAreaId), assigned: true };
}

async function removeThematicArea(cycleId, thematicAreaId) {
	await requireCycle(cycleId);
	const removed = await sequelize.transaction((transaction) => repository.removeThematicAreaAssignment(cycleId, thematicAreaId, transaction));
	if (!removed) throw new AppError('Thematic area assignment was not found for this cycle.', 404, 'CYCLE_THEMATIC_AREA_NOT_FOUND');
	return { cycle_id: Number(cycleId), thematic_area_id: Number(thematicAreaId), removed: true };
}

module.exports = {
	listCycles,
	getCycle,
	createCycle,
	updateCycle,
	updateCycleStatus,
	listCycleFacilities,
	assignFacility,
	removeFacility,
	listCycleThematicAreas,
	assignThematicArea,
	removeThematicArea,
	toCycleResponse,
};
