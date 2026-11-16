// src/controllers/thematic-areas.controller.js
const { matchedData } = require('express-validator');
const service = require('../services/thematic-areas.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const result = await service.listThematicAreas(matchedData(req, { locations: ['query'] }));
		return successResponse(res, 200, result);
	} catch (error) {
		return controllerError(res, error, 'Unable to list thematic areas.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getThematicArea(Number(req.params.id)));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the thematic area.');
	}
}

async function create(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createThematicArea(payload, req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the thematic area.');
	}
}

async function update(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateThematicArea(Number(req.params.id), payload, req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the thematic area.');
	}
}

async function destroy(req, res) {
	try {
		return successResponse(res, 200, await service.deleteThematicArea(Number(req.params.id), req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to delete the thematic area.');
	}
}

module.exports = { list, getById, create, update, destroy };
