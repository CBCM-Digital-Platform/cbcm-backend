const { matchedData } = require('express-validator');
const service = require('../services/practical-checklists.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const result = await service.listChecklists(matchedData(req, { locations: ['query'] }) || {}, req.user);
		return successResponse(res, 200, result.items, {
			page: result.page,
			limit: result.limit,
			total: result.total,
			totalPages: result.totalPages,
		});
	} catch (error) {
		return controllerError(res, error, 'Unable to list practical checklists.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getChecklist(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the practical checklist.');
	}
}

async function create(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] }) || req.body;
		return successResponse(res, 201, await service.createChecklist(payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the practical checklist.');
	}
}

async function update(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] }) || req.body;
		return successResponse(res, 200, await service.updateChecklist(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the practical checklist.');
	}
}

async function publish(req, res) {
	try {
		return successResponse(res, 200, await service.publishChecklist(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to publish the practical checklist.');
	}
}

async function archive(req, res) {
	try {
		return successResponse(res, 200, await service.archiveChecklist(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to archive the practical checklist.');
	}
}

module.exports = { list, getById, create, update, publish, archive };
