// src/controllers/matching.controller.js
const { matchedData } = require('express-validator');
const service = require('../services/matching.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function findMatches(req, res) {
	try {
		const result = await service.findMentorMatches(matchedData(req, { locations: ['body'] }), req.user);
		return successResponse(res, 200, result);
	} catch (error) {
		return controllerError(res, error, 'Unable to find mentor matches.');
	}
}

module.exports = {
	findMatches,
};
