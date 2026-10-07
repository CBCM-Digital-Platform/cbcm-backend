// src/controllers/facilities.controller.js
const { matchedData } = require('express-validator');
const service = require('../services/facilities.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const result = await service.listFacilities(matchedData(req, { locations: ['query'] }));
		return successResponse(res, 200, result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
	} catch (error) {
		return controllerError(res, error, 'Unable to list facilities.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getFacility(Number(req.params.id)));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the facility.');
	}
}

async function create(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createFacility(payload, req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the facility.');
	}
}

async function update(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateFacility(Number(req.params.id), payload, req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the facility.');
	}
}

module.exports = { list, getById, create, update };
