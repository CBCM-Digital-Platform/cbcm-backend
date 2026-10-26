const { matchedData } = require('express-validator');
const service = require('../services/settings.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function listFaqs(req, res) {
	try {
		const result = await service.listFaqs(matchedData(req, { locations: ['query'] }), req.user);
		return successResponse(res, 200, result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
	} catch (error) {
		return controllerError(res, error, 'Unable to list FAQs.');
	}
}

async function getFaq(req, res) {
	try {
		return successResponse(res, 200, await service.getFaq(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the FAQ.');
	}
}

async function createFaq(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createFaq(payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the FAQ.');
	}
}

async function updateFaq(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateFaq(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the FAQ.');
	}
}

async function deleteFaq(req, res) {
	try {
		await service.deleteFaq(Number(req.params.id), req.user);
		return successResponse(res, 200, { message: 'FAQ deleted successfully.' });
	} catch (error) {
		return controllerError(res, error, 'Unable to delete the FAQ.');
	}
}

async function listGuides(req, res) {
	try {
		const result = await service.listGuides(matchedData(req, { locations: ['query'] }), req.user);
		return successResponse(res, 200, result.items, { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages });
	} catch (error) {
		return controllerError(res, error, 'Unable to list guides.');
	}
}

async function getGuide(req, res) {
	try {
		return successResponse(res, 200, await service.getGuide(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the guide.');
	}
}

async function createGuide(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createGuide(payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to create the guide.');
	}
}

async function updateGuide(req, res) {
	try {
		const payload = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateGuide(Number(req.params.id), payload, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update the guide.');
	}
}

async function deleteGuide(req, res) {
	try {
		await service.deleteGuide(Number(req.params.id), req.user);
		return successResponse(res, 200, { message: 'Guide deleted successfully.' });
	} catch (error) {
		return controllerError(res, error, 'Unable to delete the guide.');
	}
}

module.exports = {
	listFaqs,
	getFaq,
	createFaq,
	updateFaq,
	deleteFaq,
	listGuides,
	getGuide,
	createGuide,
	updateGuide,
	deleteGuide,
};
