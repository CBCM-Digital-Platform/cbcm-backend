const { matchedData } = require('express-validator');
const service = require('../services/assessment-passing-rules.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const result = await service.listPassingRules(matchedData(req, { locations: ['query'] }) || {}, req.user);
		return successResponse(res, 200, result);
	} catch (error) {
		return controllerError(res, error, 'Unable to list passing rules.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getPassingRule(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the passing rule.');
	}
}

async function create(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createPassingRule(payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the passing rule.');
	}
}

async function update(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updatePassingRule(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the passing rule.');
	}
}

async function remove(req, res) {
	try {
		return successResponse(res, 200, await service.deletePassingRule(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to delete the passing rule.');
	}
}

module.exports = {
	list,
	getById,
	create,
	update,
	remove,
};
