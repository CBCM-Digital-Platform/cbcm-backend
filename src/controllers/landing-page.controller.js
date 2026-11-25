const { matchedData } = require('express-validator');
const service = require('../services/landing-page.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function getPublic(req, res) {
	res.set('Cache-Control', 'no-store');
	try {
		return successResponse(res, 200, await service.getLandingPage());
	} catch (error) {
		return controllerError(res, error, 'Unable to load landing page content.');
	}
}

async function getAdmin(req, res) {
	try {
		return successResponse(res, 200, await service.getLandingPage());
	} catch (error) {
		return controllerError(res, error, 'Unable to load landing page content for administration.');
	}
}

async function updateAdmin(req, res) {
	try {
		const { content } = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateLandingPage(content, req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to update landing page content.');
	}
}

module.exports = { getPublic, getAdmin, updateAdmin };
