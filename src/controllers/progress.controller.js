// src/controllers/progress.controller.js
const { matchedData } = require('express-validator');
const service = require('../services/progress.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const result = await service.listSnapshots(matchedData(req, { locations: ['query'] }), req.user);
		return successResponse(res, 200, result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
	} catch (error) {
		return controllerError(res, error, 'Unable to list snapshots.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getSnapshot(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the snapshot.');
	}
}

async function create(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createSnapshot(payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the snapshot.');
	}
}

async function getMenteeSnapshots(req, res) {
	try {
		return successResponse(res, 200, await service.getMenteeSnapshots(Number(req.params.menteeId), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load mentee snapshots.');
	}
}

async function getSummary(req, res) {
	try {
		return successResponse(res, 200, await service.getProgressSummary(matchedData(req, { locations: ['query'] }), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load progress summary.');
	}
}

async function getMenteeCompetencyBreakdown(req, res) {
	try {
		return successResponse(res, 200, await service.getMenteeCompetencyBreakdown(Number(req.params.menteeId), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load mentee competency breakdown.');
	}
}

async function getTrends(req, res) {
	try {
		return successResponse(res, 200, await service.getProgressTrends(matchedData(req, { locations: ['query'] }), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load progress trends.');
	}
}

async function getMenteeTrends(req, res) {
	try {
		return successResponse(res, 200, await service.getMenteeProgressTrends(Number(req.params.menteeId), matchedData(req, { locations: ['query'] }), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load mentee progress trends.');
	}
}

module.exports = {
	list,
	getById,
	create,
	getMenteeSnapshots,
	getSummary,
	getMenteeCompetencyBreakdown,
	getTrends,
	getMenteeTrends,
};
