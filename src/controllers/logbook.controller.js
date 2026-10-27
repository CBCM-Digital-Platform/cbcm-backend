const { matchedData } = require('express-validator');
const service = require('../services/logbook.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const filters = matchedData(req, { locations: ['query'] });
		const result = await service.listLogbook(filters, req.user);
		return successResponse(res, 200, result.items, {
			page: result.page,
			limit: result.limit,
			total: result.total,
			totalPages: result.totalPages,
		});
	} catch (error) {
		return controllerError(res, error, 'Unable to list logbook entries.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getLogbook(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the logbook entry.');
	}
}

async function create(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createLogbook(payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the logbook entry.');
	}
}

async function submit(req, res) {
	try {
		return successResponse(res, 200, await service.submitLogbook(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to submit the logbook entry.');
	}
}

async function update(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateLogbook(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the logbook entry.');
	}
}

async function approve(req, res) {
	try {
		return successResponse(res, 200, await service.approveLogbook(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to approve the logbook entry.');
	}
}

async function requestRevision(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.requestRevision(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to request revision for the logbook entry.');
	}
}

async function getProgress(req, res) {
	try {
		return successResponse(res, 200, await service.getProgressSummary(Number(req.params.mentee_id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load progress summary.');
	}
}

module.exports = {
	list,
	getById,
	create,
	submit,
	update,
	approve,
	requestRevision,
	getProgress,
};
