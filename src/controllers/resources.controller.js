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

async function assignToMentee(req, res) {
	try {
		const data = await service.assignResourceToMentee(
			Number(req.params.id),
			Number(req.params.menteeId),
			req.user
		);
		return successResponse(res, 201, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to assign the resource to the mentee.');
	}
}

async function assignToMentees(req, res) {
	try {
		const assignments = [];
		for (const menteeId of req.learningInput.mentee_ids) {
			assignments.push(await service.assignResourceToMentee(
				Number(req.params.id),
				menteeId,
				req.user
			));
		}
		return successResponse(res, 201, assignments);
	} catch (error) {
		return controllerError(res, error, 'Unable to assign the resource to the mentees.');
	}
}

async function revokeFromMentee(req, res) {
	try {
		const data = await service.revokeResourceAssignment(
			Number(req.params.id),
			Number(req.params.menteeId),
			req.user
		);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to revoke the resource assignment.');
	}
}

async function assignToMenteeInModule(req, res) {
	try {
		const result = await service.assignResourceToMenteeInModule(
			Number(req.params.moduleId),
			Number(req.params.resourceId),
			req.learningInput.mentee_id,
			req.user
		);
		return successResponse(res, result.created ? 201 : 200, result);
	} catch (error) {
		return controllerError(res, error, 'Unable to assign the resource to the mentee.');
	}
}

async function revokeAssignment(req, res) {
	try {
		const data = await service.revokeResourceAssignmentById(Number(req.params.assignmentId), req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to revoke the resource assignment.');
	}
}

async function listMenteeAssignments(req, res) {
	try {
		const data = await service.listMenteeResourceAssignments(Number(req.params.menteeId), req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to list the mentee resource assignments.');
	}
}

async function listModuleResourceAssignments(req, res) {
	try {
		const data = await service.listModuleResourceAssignments(
			Number(req.params.moduleId),
			Number(req.params.resourceId),
			req.user
		);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to list resource assignment progress.');
	}
}

async function listMyAssignments(req, res) {
	try {
		const data = await service.listMyResourceAssignments(req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to list your resource assignments.');
	}
}

async function getMyResource(req, res) {
	try {
		const data = await service.getResource(Number(req.params.resourceId), req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to load the assigned resource.');
	}
}

async function downloadMyResource(req, res, next) {
	try {
		const file = await service.openResourceFile(Number(req.params.resourceId), req.user);
		res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
		res.setHeader('Content-Length', String(file.sizeBytes || 0));
		res.setHeader('Content-Disposition', 'inline');
		file.stream.on('error', next);
		return file.stream.pipe(res);
	} catch (error) {
		return controllerError(res, error, 'Unable to download the assigned resource file.');
	}
}

async function completeMyResource(req, res) {
	try {
		const data = await service.completeMyResourceAssignment(Number(req.params.resourceId), req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to confirm resource completion.');
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
	assignToMentee,
	assignToMentees,
	revokeFromMentee,
	assignToMenteeInModule,
	revokeAssignment,
	listMenteeAssignments,
	listModuleResourceAssignments,
	listMyAssignments,
	getMyResource,
	downloadMyResource,
	completeMyResource,
	download,
};
