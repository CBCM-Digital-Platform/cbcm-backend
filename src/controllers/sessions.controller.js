// src/controllers/sessions.controller.js
const { matchedData } = require('express-validator');
const service = require('../services/sessions.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function list(req, res) {
	try {
		const result = await service.listSessions(matchedData(req, { locations: ['query'] }), req.user);
		return successResponse(res, 200, result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
	} catch (error) {
		return controllerError(res, error, 'Unable to list sessions.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getSession(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the session.');
	}
}

async function availableTimes(req, res) {
	try {
		const { assignment_id, date, duration_minutes } = req.query;
		return successResponse(res, 200, await service.getAvailableTimes({ assignment_id: Number(assignment_id), date, duration_minutes: duration_minutes ? Number(duration_minutes) : 60 }, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load available times.');
	}
}
	async function create(req, res) {
		try {
			const payload = matchedData(req, { locations: ['body'] });
			return successResponse(res, 201, await service.createSession(payload, req.user));
		} catch (error) {
			return controllerError(res, error, 'Unable to create the session.');
		}
	}

async function update(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateSession(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the session.');
	}
}

async function updateStatus(req, res) {
	try {
		const { status } = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateSessionStatus(Number(req.params.id), status, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update session status.');
	}
}

async function createNote(req, res) {
	try {
		const { note } = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createMentorNote(Number(req.params.id), note, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to create clinical note.');
	}
}

async function getNotes(req, res) {
	try {
		return successResponse(res, 200, await service.getMentorNotes(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load clinical notes.');
	}
}

async function getJoinToken(req, res) {
	try {
		return successResponse(res, 200, await service.generateJoinToken(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to generate Jitsi join token.');
	}
}

async function handleParticipantJoin(req, res) {
	try {
		return successResponse(res, 200, await service.handleParticipantJoin(Number(req.params.id), req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to process participant join.');
	}
}

module.exports = {
	availableTimes,
	list,
	getById,
	create,
	update,
	updateStatus,
	createNote,
	getNotes,
	getJoinToken,
	handleParticipantJoin,
};


