// src/repositories/cycles.repository.js
const { MentorshipCycle, Facility, ThematicArea, CycleFacility, CycleThematicArea } = require('../models');

function list({ where, limit, offset }) {
	return MentorshipCycle.findAndCountAll({
		where,
		order: [['id', 'DESC']],
		limit,
		offset,
	});
}

function findById(id, options = {}) {
	return MentorshipCycle.findByPk(id, options);
}

function create(values, transaction) {
	return MentorshipCycle.create(values, { transaction });
}

async function update(cycle, values, transaction) {
	await cycle.update(values, { transaction });
	return cycle;
}

function updateStatusIfCurrent(id, currentStatus, status, updatedBy, transaction) {
	return MentorshipCycle.update(
		{ status, updated_by: updatedBy },
		{ where: { id, status: currentStatus }, transaction }
	);
}

function listFacilities(cycleId) {
	return CycleFacility.findAll({
		where: { cycle_id: cycleId },
		include: [{ model: Facility, as: 'facility' }],
		order: [['id', 'ASC']],
	});
}

function findFacilityAssignment(cycleId, facilityId, transaction) {
	return CycleFacility.findOne({
		where: { cycle_id: cycleId, facility_id: facilityId },
		...(transaction && { transaction }),
	});
}

function createFacilityAssignment(values, transaction) {
	return CycleFacility.create(values, { transaction });
}

function removeFacilityAssignment(cycleId, facilityId, transaction) {
	return CycleFacility.destroy({
		where: { cycle_id: cycleId, facility_id: facilityId },
		...(transaction && { transaction }),
	});
}

function listThematicAreas(cycleId) {
	return CycleThematicArea.findAll({
		where: { cycle_id: cycleId },
		include: [{ model: ThematicArea, as: 'thematicArea' }],
		order: [['id', 'ASC']],
	});
}

function findThematicAreaAssignment(cycleId, thematicAreaId, transaction) {
	return CycleThematicArea.findOne({
		where: { cycle_id: cycleId, thematic_area_id: thematicAreaId },
		...(transaction && { transaction }),
	});
}

function createThematicAreaAssignment(values, transaction) {
	return CycleThematicArea.create(values, { transaction });
}

function removeThematicAreaAssignment(cycleId, thematicAreaId, transaction) {
	return CycleThematicArea.destroy({
		where: { cycle_id: cycleId, thematic_area_id: thematicAreaId },
		...(transaction && { transaction }),
	});
}

module.exports = {
	list,
	findById,
	create,
	update,
	updateStatusIfCurrent,
	listFacilities,
	findFacilityAssignment,
	createFacilityAssignment,
	removeFacilityAssignment,
	listThematicAreas,
	findThematicAreaAssignment,
	createThematicAreaAssignment,
	removeThematicAreaAssignment,
};
