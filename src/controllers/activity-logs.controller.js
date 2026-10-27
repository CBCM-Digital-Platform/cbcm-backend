// src/controllers/activity-logs.controller.js
const { matchedData } = require('express-validator');
const service = require('../services/activity-logs.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const result = await service.listActivityLogs(matchedData(req, { locations: ['query'] }), req.user);
		return successResponse(res, 200, result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
	} catch (error) {
		return controllerError(res, error, 'Unable to list activity logs.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getActivityLogById(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load activity log.');
	}
}

module.exports = {
	list,
	getById,
};
