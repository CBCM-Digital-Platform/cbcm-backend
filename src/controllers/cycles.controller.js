// src/controllers/cycles.controller.js
const { matchedData } = require('express-validator');
const service = require('../services/cycles.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const result = await service.listCycles(matchedData(req, { locations: ['query'] }));
		return successResponse(res, 200, result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
	} catch (error) {
		return controllerError(res, error, 'Unable to list mentorship cycles.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getCycle(Number(req.params.id)));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the mentorship cycle.');
	}
}

async function create(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createCycle(payload, req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the mentorship cycle.');
	}
}

async function update(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateCycle(Number(req.params.id), payload, req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the mentorship cycle.');
	}
}

async function updateStatus(req, res) {
	try {
		const { status } = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateCycleStatus(Number(req.params.id), status, req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the mentorship cycle status.');
	}
}

async function listFacilities(req, res) {
	try {
		return successResponse(res, 200, await service.listCycleFacilities(Number(req.params.cycleId)));
	} catch (error) {
		return controllerError(res, error, 'Unable to list cycle facilities.');
	}
}

async function assignFacility(req, res) {
	try {
		const { facility_id: facilityId } = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.assignFacility(Number(req.params.cycleId), Number(facilityId), req.user.id, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to assign the facility to the cycle.');
	}
}

async function removeFacility(req, res) {
	try {
		return successResponse(res, 200, await service.removeFacility(Number(req.params.cycleId), Number(req.params.facilityId), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to remove the facility from the cycle.');
	}
}

async function listThematicAreas(req, res) {
	try {
		return successResponse(res, 200, await service.listCycleThematicAreas(Number(req.params.cycleId)));
	} catch (error) {
		return controllerError(res, error, 'Unable to list cycle thematic areas.');
	}
}

async function assignThematicArea(req, res) {
	try {
		const { thematic_area_id: thematicAreaId } = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.assignThematicArea(Number(req.params.cycleId), Number(thematicAreaId), req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to assign the thematic area to the cycle.');
	}
}

async function removeThematicArea(req, res) {
	try {
		return successResponse(res, 200, await service.removeThematicArea(Number(req.params.cycleId), Number(req.params.thematicAreaId)));
	} catch (error) {
		return controllerError(res, error, 'Unable to remove the thematic area from the cycle.');
	}
}

module.exports = {
	list,
	getById,
	create,
	update,
	updateStatus,
	listFacilities,
	assignFacility,
	removeFacility,
	listThematicAreas,
	assignThematicArea,
	removeThematicArea,
};
