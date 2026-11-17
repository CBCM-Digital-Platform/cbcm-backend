const { matchedData } = require('express-validator');
const service = require('../services/news.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function listPublic(req, res) {
	res.set('Cache-Control', 'public, max-age=60');
	try {
		const query = matchedData(req, { locations: ['query'] });
		return successResponse(res, 200, await service.listPublicNews(query));
	} catch (error) {
		return controllerError(res, error, 'Unable to list news.');
	}
}

async function getPublic(req, res) {
	res.set('Cache-Control', 'public, max-age=60');
	try {
		return successResponse(res, 200, await service.getPublicNews(req.params.idOrSlug));
	} catch (error) {
		return controllerError(res, error, 'Unable to load news.');
	}
}

async function listAdmin(req, res) {
	try {
		const query = matchedData(req, { locations: ['query'] });
		return successResponse(res, 200, await service.listAdminNews(query));
	} catch (error) {
		return controllerError(res, error, 'Unable to list news for administration.');
	}
}

async function create(req, res) {
	try {
		const input = matchedData(req, { locations: ['body'] });
		return successResponse(res, 201, await service.createNews(input, req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to create news.');
	}
}

async function update(req, res) {
	try {
		const input = matchedData(req, { locations: ['body'] });
		return successResponse(res, 200, await service.updateNews(req.params.id, input, req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to update news.');
	}
}

async function destroy(req, res) {
	try {
		return successResponse(res, 200, await service.deleteNews(req.params.id, req.user.id));
	} catch (error) {
		return controllerError(res, error, 'Unable to delete news.');
	}
}

module.exports = { listPublic, getPublic, listAdmin, create, update, destroy };
