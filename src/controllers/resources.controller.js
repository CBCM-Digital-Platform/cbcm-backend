const service = require('../services/resources.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function create(req, res) {
	try {
		const data = await service.createResource(req.body, req.user);
		return successResponse(res, 201, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to create the resource.');
	}
}

async function list(req, res) {
	try {
		const result = await service.listResources(req.query, req.user);
		return successResponse(res, 200, result.items, {
			page: result.page,
			limit: result.limit,
			total: result.total,
			totalPages: result.totalPages,
		});
	} catch (error) {
		return controllerError(res, error, 'Unable to list resources.');
	}
}

async function getById(req, res) {
	try {
		const data = await service.getResource(Number(req.params.id), req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to load the resource.');
	}
}

async function update(req, res) {
	try {
		const data = await service.updateResource(Number(req.params.id), req.body, req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to update the resource.');
	}
}

async function remove(req, res) {
	try {
		const result = await service.deleteResource(Number(req.params.id), req.user);
		return successResponse(res, 200, result);
	} catch (error) {
		return controllerError(res, error, 'Unable to delete the resource.');
	}
}

async function download(req, res, next) {
	try {
		const file = await service.openResourceFile(Number(req.params.id), req.user);
		res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
		res.setHeader('Content-Length', String(file.sizeBytes || 0));
		res.setHeader('Content-Disposition', 'inline');
		file.stream.on('error', next);
		return file.stream.pipe(res);
	} catch (error) {
		return controllerError(res, error, 'Unable to download the resource file.');
	}
}

module.exports = {
	create,
	list,
	getById,
	update,
	remove,
	download,
};