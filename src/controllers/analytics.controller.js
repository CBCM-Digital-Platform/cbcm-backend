// src/controllers/analytics.controller.js
const { matchedData } = require('express-validator');
const service = require('../services/analytics.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function getDashboard(req, res) {
	try {
		return successResponse(res, 200, await service.getDashboardMetrics(req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load dashboard metrics.');
	}
}

async function getActivitySummary(req, res) {
	try {
		return successResponse(res, 200, await service.getActivitySummary(matchedData(req, { locations: ['query'] }), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load activity summary.');
	}
}

async function getLearningProgress(req, res) {
	try {
		return successResponse(res, 200, await service.getLearningProgressMetrics(req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load learning progress metrics.');
	}
}

module.exports = {
	getDashboard,
	getActivitySummary,
	getLearningProgress,
};
