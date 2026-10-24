// src/controllers/assessments.controller.js
const { matchedData } = require('express-validator');
const service = require('../services/assessments.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const result = await service.listAssessments(matchedData(req, { locations: ['query'] }), req.user);
		return successResponse(res, 200, result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
	} catch (error) {
		return controllerError(res, error, 'Unable to list assessments.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getAssessment(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the assessment.');
	}
}

async function create(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createAssessment(payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the assessment.');
	}
}

async function update(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateAssessment(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the assessment.');
	}
}

async function finalize(req, res) {
	try {
		return successResponse(res, 200, await service.finalizeAssessment(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to finalize the assessment.');
	}
}

async function review(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.reviewAssessment(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to review the assessment.');
	}
}

async function setCriteriaScore(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.setCriteriaScore(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to set criteria scores.');
	}
}

async function setChecklistItems(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.setChecklistItems(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to set checklist items.');
	}
}

async function addEvidence(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.addEvidence(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to add evidence.');
	}
}

module.exports = {
	list,
	getById,
	create,
	update,
	finalize,
	review,
	setCriteriaScore,
	setChecklistItems,
	addEvidence,
};
