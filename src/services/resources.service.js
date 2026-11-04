const { Op } = require('sequelize');
const { sequelize } = require('../models');
const storage = require('../providers/storage.provider');
const models = require('../models');
const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const { hasAnyRole, SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const { ALLOWED_RESOURCE_MIME_TYPES } = require('../config/multer');
const repository = require('../repositories/resources.repository');
const notificationService = require('./notifications.service');
const { toResource } = require('../dtos/response/resource.response.dto');
const {
	validateCreate,
	validateUpdate,
	validateList,
} = require('../validators/resources.validator');

const normalizeRole = (role) => String(role || '').toLowerCase();
const isSystemAdmin = (role) => hasAnyRole(role, SYSTEM_ADMIN_ROLES);
const isFacilityAdmin = (role) => normalizeRole(role) === Role.FACILITY_ADMIN;

const isModulePublishedAndAuthorized = (module) => (
	Boolean(module?.is_published)
	&& Boolean(module?.is_authorized)
	&& String(module?.status || '').toLowerCase() === 'published'
);

const toResourceAssignment = (assignment) => ({
	id: assignment.id,
	resourceId: assignment.resource_id,
	mentorId: assignment.mentor_id,
	menteeId: assignment.mentee_id,
	facilityId: assignment.facility_id,
	status: assignment.assignment_status,
	assignedBy: assignment.assigned_by,
	assignedAt: assignment.assigned_at,
	completedAt: assignment.completed_at || null,
	revokedAt: assignment.revoked_at || null,
	revokedBy: assignment.revoked_by || null,
});

async function assertMentorModuleAccess(moduleId, actor) {
	if (normalizeRole(actor?.role) !== Role.MENTOR) {
		throw new AppError('Mentor role required.', 403, 'FORBIDDEN');
	}
	const module = await repository.getModuleById(moduleId);
	if (!module) {
		throw new AppError('Learning module not found.', 404, 'NOT_FOUND');
	}
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('This resource belongs to an unpublished or unauthorized learning module.', 403, 'FORBIDDEN');
	}
	const [hasModuleAccess, hasAssignment] = await Promise.all([
		repository.hasModuleMentorAccess({ mentorId: actor.id, moduleId }),
		repository.hasActiveMentorAssignment({ mentorId: actor.id, moduleId }),
	]);
	if (!hasModuleAccess) {
		throw new AppError('You do not have access to resources for this module.', 403, 'FORBIDDEN');
	}
	if (!hasAssignment) {
		throw new AppError('You are not assigned to this module thematic area.', 403, 'FORBIDDEN');
	}
	return module;
}

async function isMenteeAssignmentAuthorized(assignment, resource) {
	if (!assignment || !resource?.module_id || assignment.assignment_status !== 'active') return false;
	const module = await repository.getModuleById(resource.module_id);
	if (!isModulePublishedAndAuthorized(module)) return false;
	const [hasModuleAccess, hasMentorAssignment] = await Promise.all([
		repository.hasModuleMentorAccess({ mentorId: assignment.mentor_id, moduleId: resource.module_id }),
		repository.hasActiveMentorAssignment({
			mentorId: assignment.mentor_id,
			menteeId: assignment.mentee_id,
			moduleId: resource.module_id,
		}),
	]);
	return hasModuleAccess && hasMentorAssignment;
}

async function findResourceAssignment(resourceId, menteeId, status) {
	return models.ResourceAssignment.findOne({
		where: {
			resource_id: resourceId,
			mentee_id: menteeId,
			assignment_status: status,
		},
		order: [['assigned_at', 'DESC'], ['id', 'DESC']],
	});
}

function assertCanManageResources(actor) {
	if (!actor || !hasAnyRole(actor.role, SYSTEM_ADMIN_ROLES)) {
		throw new AppError('Only system administrators can manage learning resources.', 403, 'FORBIDDEN');
	}
}

async function assertModuleAndScope({ moduleId, thematicAreaId, actor }) {
	const module = await repository.getModuleById(moduleId);
	if (!module) {
		throw new AppError('Learning module not found.', 404, 'NOT_FOUND');
	}

	if (thematicAreaId !== undefined && thematicAreaId !== null) {
		if (Number(module.thematic_area_id) !== Number(thematicAreaId)) {
			throw new AppError('Learning module does not belong to the selected thematic area.', 400, 'MODULE_THEMATIC_AREA_MISMATCH');
		}
		const thematicArea = await repository.getThematicAreaById(thematicAreaId);
		if (!thematicArea) {
			throw new AppError('Thematic area not found.', 404, 'NOT_FOUND');
		}
	}

	if (isFacilityAdmin(actor?.role)) {
		const inFacilityScope = await repository.isModuleInFacilityScope({
			moduleId,
			facilityId: actor.facility_id,
		});
		if (!inFacilityScope) {
			throw new AppError('The requested learning module is outside your facility scope.', 403, 'FORBIDDEN');
		}
	}

	return module;
}

async function assertFileAndTypeMatch({ fileId, type }) {
	const file = await repository.getFileById(fileId);
	if (!file) {
		throw new AppError('Referenced file does not exist.', 404, 'FILE_NOT_FOUND');
	}

	const mimeFamily = ALLOWED_RESOURCE_MIME_TYPES[file.mime_type];
	if (!mimeFamily) {
		throw new AppError('Only PDF, audio, and video files are supported.', 400, 'UNSUPPORTED_MEDIA_TYPE');
	}

	if (type !== mimeFamily) {
		throw new AppError(
			`Resource type '${type}' does not match file MIME type '${file.mime_type}'.`,
			400,
			'MIME_TYPE_MISMATCH'
		);
	}

	return file;
}

async function assertCanManageResourceRecord(resource, actor) {
	assertCanManageResources(actor);
	if (isSystemAdmin(actor?.role)) return;
}

async function createResource(body, actor) {
	assertCanManageResources(actor);
	const payload = validateCreate(body);

	await assertModuleAndScope({
		moduleId: payload.module_id,
		thematicAreaId: payload.thematic_area_id,
		actor,
	});

	await assertFileAndTypeMatch({
		fileId: payload.file_id,
		type: payload.type,
	});

	const created = await sequelize.transaction(async (transaction) => {
		const record = await repository.create({
			title: payload.title,
			type: payload.type,
			thematic_area_id: payload.thematic_area_id,
			module_id: payload.module_id,
			file_id: payload.file_id,
			url: payload.url || null,
			created_by: actor.id,
			updated_by: actor.id,
		}, transaction);

		return repository.findById(record.id, { transaction });
	});

	return toResource(created);
}

async function getResource(id, actor) {
	const resource = await repository.findById(id);
	if (!resource) {
		throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	}

	const role = normalizeRole(actor?.role);

	if (isSystemAdmin(role)) {
		return toResource(resource);
	}

	if (isFacilityAdmin(role)) {
		if (resource.module_id) {
			const inScope = await repository.isModuleInFacilityScope({
				moduleId: resource.module_id,
				facilityId: actor.facility_id,
			});
			if (!inScope) {
				throw new AppError('You do not have permission to access this resource.', 403, 'FORBIDDEN');
			}
		} else if (resource.thematic_area_id) {
			const inScope = await repository.isThematicAreaInFacilityScope({
				thematicAreaId: resource.thematic_area_id,
				facilityId: actor.facility_id,
			});
			if (!inScope) {
				throw new AppError('You do not have permission to access this resource.', 403, 'FORBIDDEN');
			}
		} else {
			throw new AppError('You do not have permission to access this resource.', 403, 'FORBIDDEN');
		}
		return toResource(resource);
	}

	if (role === Role.MENTOR) {
		if (!resource.module_id) {
			throw new AppError('Only resources linked to an authorized learning module are available to mentors.', 403, 'FORBIDDEN');
		}
		await assertMentorModuleAccess(resource.module_id, actor);
		return toResource(resource);
	}

	if (role === Role.MENTEE) {
		const assignment = await findResourceAssignment(id, actor.id, 'active');
		if (!await isMenteeAssignmentAuthorized(assignment, resource)) {
			throw new AppError('This resource has not been assigned to you.', 403, 'FORBIDDEN');
		}
		return toResource(resource);
	}

	throw new AppError('You do not have permission to access this resource.', 403, 'FORBIDDEN');
}

async function listResources(query, actor) {
	const parsed = validateList(query);
	const role = normalizeRole(actor?.role);

	const where = {};
	if (parsed.thematic_area_id !== undefined) {
		where.thematic_area_id = parsed.thematic_area_id;
	}
	if (parsed.module_id !== undefined) {
		where.module_id = parsed.module_id;
	}
	if (parsed.type !== undefined) {
		where.type = parsed.type;
	}

	if (isSystemAdmin(role)) {
		// System admin can see all matching resources
	} else if (isFacilityAdmin(role)) {
		const allowedModuleIds = await repository.listModuleIdsForFacility(actor.facility_id);
		const allowedThematicAreaIds = await repository.listFacilityThematicAreaIds(actor.facility_id);

		const facilityScopeConditions = [];
		if (allowedModuleIds.length > 0) {
			facilityScopeConditions.push({ module_id: { [Op.in]: allowedModuleIds } });
		}
		if (allowedThematicAreaIds.length > 0) {
			facilityScopeConditions.push({
				module_id: null,
				thematic_area_id: { [Op.in]: allowedThematicAreaIds },
			});
		}

		if (facilityScopeConditions.length === 0) {
			return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
		}

		where[Op.and] = where[Op.and] || [];
		where[Op.and].push({ [Op.or]: facilityScopeConditions });
	} else if (role === Role.MENTOR) {
		const grantedIds = await repository.listMentorModuleIds(actor.id);
		const eligibleIds = (await Promise.all(
			grantedIds.map(async (moduleId) => {
				const [module, assigned, hasModuleAccess] = await Promise.all([
					repository.getModuleById(moduleId),
					repository.hasActiveMentorAssignment({ mentorId: actor.id, moduleId }),
					repository.hasModuleMentorAccess({ mentorId: actor.id, moduleId }),
				]);
				if (!module || !isModulePublishedAndAuthorized(module) || !assigned || !hasModuleAccess) return null;
				return moduleId;
			})
		)).filter(Boolean);

		if (!eligibleIds.length) {
			return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
		}

		if (where.module_id !== undefined) {
			if (!eligibleIds.includes(where.module_id)) {
				return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
			}
		} else {
			where.module_id = { [Op.in]: eligibleIds };
		}
	} else if (role === Role.MENTEE) {
		const assignments = await models.ResourceAssignment.findAll({
			where: { mentee_id: actor.id, assignment_status: 'active' },
			order: [['assigned_at', 'DESC'], ['id', 'DESC']],
		});
		if (!assignments.length) {
			return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
		}
		const authorizedResourceIds = (await Promise.all(assignments.map(async (assignment) => {
			const resource = await repository.findById(assignment.resource_id);
			if (!await isMenteeAssignmentAuthorized(assignment, resource)) return null;
			return Number(resource.id);
		}))).filter(Boolean);
		if (!authorizedResourceIds.length) {
			return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
		}
		where.id = { [Op.in]: authorizedResourceIds };
	} else {
		throw new AppError('You do not have permission to access resources.', 403, 'FORBIDDEN');
	}

	const offset = (parsed.page - 1) * parsed.limit;
	const { rows, count } = await repository.findAndCountAll({
		where,
		limit: parsed.limit,
		offset,
		order: [['id', 'DESC']],
	});

	return {
		items: rows.map(toResource),
		total: count,
		page: parsed.page,
		limit: parsed.limit,
		totalPages: Math.ceil(count / parsed.limit) || 0,
	};
}

async function assignResourceToMentee(resourceId, menteeId, actor) {
	if (normalizeRole(actor?.role) !== Role.MENTOR) {
		throw new AppError('Mentor role required.', 403, 'FORBIDDEN');
	}

	const resource = await getResource(resourceId, actor);

	const assignedToMentee = await repository.hasActiveMentorAssignment({
		mentorId: actor.id,
		menteeId,
		moduleId: resource.moduleId || undefined,
	});
	if (!assignedToMentee) {
		throw new AppError('Mentee is not actively assigned to you for this module.', 403, 'FORBIDDEN');
	}

	const result = await sequelize.transaction(async (transaction) => {
		const [assignment, created] = await models.ResourceAssignment.findOrCreate({
			where: {
				resource_id: resourceId,
				mentee_id: menteeId,
				assignment_status: 'active',
			},
			defaults: {
				resource_id: resourceId,
				mentor_id: actor.id,
				mentee_id: menteeId,
				facility_id: actor.facility_id || null,
				assignment_status: 'active',
				assigned_by: actor.id,
				assigned_at: new Date(),
			},
			transaction,
		});
		return { assignment, created };
	}).then(({ assignment, created }) => ({
		...toResourceAssignment(assignment),
		resourceId,
		menteeId,
		assignmentId: assignment.id,
		assigned: created,
			created,
		}));
	await notificationService.publishEventSafely({
		eventType: 'resource.assigned',
		eventKey: `resource-assignment:${result.assignmentId}:created`,
		referenceType: 'resource_assignment',
		referenceId: result.assignmentId,
		userIds: [result.menteeId, actor.id],
		facilityIds: [actor.facility_id],
	});
	return result;
}

async function assignResourceToMenteeInModule(moduleId, resourceId, menteeId, actor) {
		const resource = await repository.findById(resourceId);
		if (!resource) throw new AppError('Resource not found.', 404, 'NOT_FOUND');
		if (Number(resource.module_id) !== Number(moduleId)) {
			throw new AppError('Resource does not belong to the requested learning module.', 400, 'RESOURCE_MODULE_MISMATCH');
		}
		await assertMentorModuleAccess(moduleId, actor);
		const assignedToMentee = await repository.hasActiveMentorAssignment({
			mentorId: actor.id,
			menteeId,
			moduleId,
		});
		if (!assignedToMentee) {
			throw new AppError('Mentee is not actively assigned to you for this module.', 403, 'FORBIDDEN');
		}
		return assignResourceToMentee(resourceId, menteeId, actor);
}

async function revokeResourceAssignment(resourceId, menteeId, actor) {
	if (normalizeRole(actor?.role) !== Role.MENTOR) {
		throw new AppError('Mentor role required.', 403, 'FORBIDDEN');
	}

	const assignment = await models.ResourceAssignment.findOne({
		where: {
			resource_id: resourceId,
			mentee_id: menteeId,
			mentor_id: actor.id,
			assignment_status: 'active',
		},
	});
	if (!assignment) {
		throw new AppError('Active resource assignment not found.', 404, 'NOT_FOUND');
	}

	await models.ResourceAssignment.update({
		assignment_status: 'revoked',
		revoked_at: new Date(),
		revoked_by: actor.id,
	}, { where: { id: assignment.id } });

	return { assignmentId: assignment.id, revoked: true };
}

async function revokeResourceAssignmentById(assignmentId, actor) {
	const assignment = await models.ResourceAssignment.findByPk(assignmentId);
	if (!assignment || assignment.assignment_status !== 'active') {
		throw new AppError('Active resource assignment not found.', 404, 'NOT_FOUND');
	}
	const role = normalizeRole(actor?.role);
	if (role === Role.MENTOR) {
		if (Number(assignment.mentor_id) !== Number(actor.id)) {
			throw new AppError('You can only revoke assignments that you created.', 403, 'FORBIDDEN');
		}
	} else if (isSystemAdmin(role)) {
		// System administrators can revoke any active assignment.
	} else if (isFacilityAdmin(role)) {
		const resource = await repository.findById(assignment.resource_id);
		if (!resource?.module_id || !await repository.isModuleInFacilityScope({
			moduleId: resource.module_id,
			facilityId: actor.facility_id,
		})) {
			throw new AppError('The assignment is outside your facility scope.', 403, 'FORBIDDEN');
		}
	} else {
		throw new AppError('You do not have permission to revoke resource assignments.', 403, 'FORBIDDEN');
	}

	const [updated] = await models.ResourceAssignment.update({
		assignment_status: 'revoked',
		revoked_at: new Date(),
		revoked_by: actor.id,
	}, {
		where: { id: assignment.id, assignment_status: 'active' },
	});
	if (!updated) throw new AppError('Active resource assignment not found.', 404, 'NOT_FOUND');
	const revoked = await models.ResourceAssignment.findByPk(assignment.id);
	return { ...toResourceAssignment(revoked), revoked: true };
}

async function listMenteeResourceAssignments(menteeId, actor) {
	if (normalizeRole(actor?.role) !== Role.MENTOR) {
		throw new AppError('Mentor role required.', 403, 'FORBIDDEN');
	}
	if (!await repository.hasActiveMentorAssignment({ mentorId: actor.id, menteeId })) {
		throw new AppError('Mentee is not actively assigned to you.', 403, 'FORBIDDEN');
	}
	const assignments = await models.ResourceAssignment.findAll({
		where: { mentee_id: menteeId },
		order: [['assigned_at', 'DESC'], ['id', 'DESC']],
	});
	const visible = [];
	for (const assignment of assignments) {
		const resource = await repository.findById(assignment.resource_id);
		if (!resource?.module_id) continue;
		const module = await repository.getModuleById(resource.module_id);
		if (!isModulePublishedAndAuthorized(module)) continue;
		const [hasModuleAccess, hasCurrentMentorAssignment] = await Promise.all([
			repository.hasModuleMentorAccess({ mentorId: actor.id, moduleId: resource.module_id }),
			repository.hasActiveMentorAssignment({
				mentorId: actor.id,
				menteeId,
				moduleId: resource.module_id,
			}),
		]);
		if (hasModuleAccess && hasCurrentMentorAssignment) {
			visible.push({ ...toResourceAssignment(assignment), resource: toResource(resource) });
		}
	}
	return visible;
}

async function listModuleResourceAssignments(moduleId, resourceId, actor) {
	await assertMentorModuleAccess(moduleId, actor);
	const resource = await repository.findById(resourceId);
	if (!resource) throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	if (Number(resource.module_id) !== Number(moduleId)) {
		throw new AppError('Resource does not belong to the requested learning module.', 400, 'RESOURCE_MODULE_MISMATCH');
	}
	const assignments = await models.ResourceAssignment.findAll({
		where: { resource_id: resourceId },
		order: [['assigned_at', 'DESC'], ['id', 'DESC']],
	});
	const visible = [];
	for (const assignment of assignments) {
		const [hasCurrentMentorAssignment, hasModuleAccess] = await Promise.all([
			repository.hasActiveMentorAssignment({
				mentorId: actor.id,
				menteeId: assignment.mentee_id,
				moduleId,
			}),
			repository.hasModuleMentorAccess({ mentorId: actor.id, moduleId }),
		]);
		if (hasCurrentMentorAssignment && hasModuleAccess) {
			visible.push({ ...toResourceAssignment(assignment), resource: toResource(resource) });
		}
	}
	return visible;
}

async function listMyResourceAssignments(actor) {
	if (normalizeRole(actor?.role) !== Role.MENTEE) {
		throw new AppError('Mentee role required.', 403, 'FORBIDDEN');
	}
	const assignments = await models.ResourceAssignment.findAll({
		where: { mentee_id: actor.id, assignment_status: 'active' },
		order: [['assigned_at', 'DESC'], ['id', 'DESC']],
	});
	const visible = [];
	for (const assignment of assignments) {
		const resource = await repository.findById(assignment.resource_id);
		if (await isMenteeAssignmentAuthorized(assignment, resource)) {
			visible.push({ ...toResourceAssignment(assignment), resource: toResource(resource) });
		}
	}
	return visible;
}

async function completeMyResourceAssignment(resourceId, actor) {
	if (normalizeRole(actor?.role) !== Role.MENTEE) {
		throw new AppError('Mentee role required.', 403, 'FORBIDDEN');
	}
	const resource = await repository.findById(resourceId);
	if (!resource) throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	const active = await findResourceAssignment(resourceId, actor.id, 'active');
	if (active) {
		if (!await isMenteeAssignmentAuthorized(active, resource)) {
			throw new AppError('This resource has not been assigned to you.', 403, 'FORBIDDEN');
		}
		const completedAt = new Date();
		const [updated] = await models.ResourceAssignment.update({
			assignment_status: 'completed',
			completed_at: completedAt,
		}, {
			where: { id: active.id, assignment_status: 'active' },
		});
		if (!updated) throw new AppError('The resource assignment is no longer active.', 409, 'CONFLICT');
		const completed = await models.ResourceAssignment.findByPk(active.id);
		return { ...toResourceAssignment(completed), completed: true };
	}
	const completed = await findResourceAssignment(resourceId, actor.id, 'completed');
	if (completed && await isMenteeAssignmentAuthorized({ ...completed.get({ plain: true }), assignment_status: 'active' }, resource)) {
		return { ...toResourceAssignment(completed), completed: true };
	}
	throw new AppError('Active resource assignment not found.', 404, 'NOT_FOUND');
}

async function updateResource(id, body, actor) {
	assertCanManageResources(actor);
	const payload = validateUpdate(body);

	const existing = await repository.findById(id);
	if (!existing) {
		throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	}

	await assertCanManageResourceRecord(existing, actor);

	const effectiveModuleId = payload.module_id !== undefined ? payload.module_id : existing.module_id;
	const effectiveThematicAreaId = payload.thematic_area_id !== undefined ? payload.thematic_area_id : existing.thematic_area_id;

	if (effectiveModuleId) {
		await assertModuleAndScope({
			moduleId: effectiveModuleId,
			thematicAreaId: effectiveThematicAreaId,
			actor,
		});
	} else if (payload.thematic_area_id !== undefined && payload.thematic_area_id !== null) {
		const thematicArea = await repository.getThematicAreaById(payload.thematic_area_id);
		if (!thematicArea) {
			throw new AppError('Thematic area not found.', 404, 'NOT_FOUND');
		}
	}

	const effectiveFileId = payload.file_id !== undefined ? payload.file_id : existing.file_id;
	const effectiveType = payload.type !== undefined ? payload.type : existing.type;

	if (effectiveFileId) {
		await assertFileAndTypeMatch({
			fileId: effectiveFileId,
			type: effectiveType,
		});
	}

	const updateData = {
		...payload,
		updated_by: actor.id,
	};

	const updated = await sequelize.transaction(async (transaction) => {
		return repository.update(id, updateData, transaction);
	});

	return toResource(updated);
}

async function deleteResource(id, actor) {
	assertCanManageResources(actor);
	const existing = await repository.findById(id);
	if (!existing) {
		throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	}

	await assertCanManageResourceRecord(existing, actor);

	await sequelize.transaction(async (transaction) => {
		await repository.destroy(id, transaction);
	});

	return { id, deleted: true };
}

async function openResourceFile(id, actor) {
	const resource = await getResource(id, actor);
	if (!resource?.file_id) {
		throw new AppError('This resource has no uploaded file.', 404, 'FILE_NOT_FOUND');
	}
	const file = await models.UploadedFile.findByPk(resource.file_id);
	if (!file) {
		throw new AppError('Referenced file does not exist.', 404, 'FILE_NOT_FOUND');
	}
	const opened = await storage.getStorageProvider().open(file.storage_key);
	return {
		mimeType: file.mime_type,
		sizeBytes: opened.sizeBytes || Number(file.size_bytes || 0),
		stream: opened.stream,
	};
}

module.exports = {
	createResource,
	getResource,
	listResources,
	updateResource,
	deleteResource,
	assignResourceToMentee,
	assignResourceToMenteeInModule,
	revokeResourceAssignment,
	revokeResourceAssignmentById,
	listMenteeResourceAssignments,
	listModuleResourceAssignments,
	listMyResourceAssignments,
	completeMyResourceAssignment,
	openResourceFile,
	isModulePublishedAndAuthorized,
};
