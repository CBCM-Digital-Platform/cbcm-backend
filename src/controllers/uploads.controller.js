const service = require('../services/uploads.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function create(req, res) {
	try {
		const data = await service.createUpload({
			actor: req.user,
			upload: req.resourceUpload,
			context: req.body?.context,
		});
		return successResponse(res, 201, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to store the uploaded file.');
	}
}

async function getById(req, res) {
	try {
		return successResponse(res, 200, await service.getUpload(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to load the uploaded file.');
	}
}

async function download(req, res, next) {
	try {
		const file = await service.openUpload(Number(req.params.id), req.user);
		res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
		res.setHeader('Content-Length', String(file.sizeBytes || 0));
		res.setHeader('Content-Disposition', 'inline');
		file.stream.on('error', next);
		return file.stream.pipe(res);
	} catch (error) {
		return controllerError(res, error, 'Unable to download the uploaded file.');
	}
}

async function remove(req, res) {
	try {
		return successResponse(res, 200, await service.deleteUpload(Number(req.params.id), req.user));
	} catch (error) {
		return controllerError(res, error, 'Unable to delete the uploaded file.');
	}
}

module.exports = {
	create,
	getById,
	download,
	remove,
};
