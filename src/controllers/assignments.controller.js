// src/controllers/assignments.controller.js
const { matchedData } = require('express-validator');
const service = require('../services/assignments.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const result = await service.listAssignments(matchedData(req, { locations: ['query'] }), req.user);
		return successResponse(res, 200, result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
	} catch (error) {
		return controllerError(res, error, 'Unable to list assignments.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getAssignment(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the assignment.');
	}
}

async function create(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createAssignment(payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the assignment.');
	}
}

async function update(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateAssignment(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the assignment.');
	}
}

async function updateStatus(req, res) {
	try {
		const { status } = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateAssignmentStatus(Number(req.params.id), status, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update assignment status.');
	}
}

async function unassign(req, res) {
	try {
		return successResponse(res, 200, await service.unassignAssignment(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to unassign the mentor-mentee pair.');
	}
}

async function getMenteeAssignments(req, res) {
	try {
		return successResponse(res, 200, await service.getMenteeAssignments(Number(req.params.menteeId), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load mentee assignments.');
	}
}

async function getMentorAssignments(req, res) {
	try {
		return successResponse(res, 200, await service.getMentorAssignments(Number(req.params.mentorId), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load mentor assignments.');
	}
}

module.exports = {
	list,
	getById,
	create,
	update,
	updateStatus,
	unassign,
	getMenteeAssignments,
	getMentorAssignments,
};
