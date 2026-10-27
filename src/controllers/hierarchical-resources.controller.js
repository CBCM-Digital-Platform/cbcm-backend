const service = require('../services/hierarchical-resources.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function create(req, res) {
	try {
		const data = await service.createResource(req.file, req.body, req.user);
		return successResponse(res, 201, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to create resource.');
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
		return controllerError(res, error, 'Unable to load resource.');
	}
}

async function grantToFacility(req, res) {
	try {
		const data = await service.grantToFacility(Number(req.params.id), req.body.facility_ids, req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to grant to facility.');
	}
}

async function revokeFromFacility(req, res) {
	try {
		const data = await service.revokeFromFacility(Number(req.params.id), Number(req.params.facilityId), req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to revoke from facility.');
	}
}

async function grantToMentor(req, res) {
	try {
		const data = await service.grantToMentor(Number(req.params.id), req.body.mentor_ids, req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to grant to mentor.');
	}
}

async function revokeFromMentor(req, res) {
	try {
		const data = await service.revokeFromMentor(Number(req.params.id), Number(req.params.mentorId), req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to revoke from mentor.');
	}
}

async function assignToMentee(req, res) {
	try {
		const data = await service.assignToMentee(Number(req.params.id), req.body.mentee_ids, req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to assign to mentee.');
	}
}

async function revokeFromMentee(req, res) {
	try {
		const data = await service.revokeFromMentee(Number(req.params.id), Number(req.params.menteeId), req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to revoke from mentee.');
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
		return controllerError(res, error, 'Unable to download resource.');
	}
}

module.exports = {
	create,
	list,
	getById,
	grantToFacility,
	revokeFromFacility,
	grantToMentor,
	revokeFromMentor,
	assignToMentee,
	revokeFromMentee,
	download,
};
