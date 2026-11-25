const { Op } = require('sequelize');
const { sequelize } = require('../models');
const storage = require('../providers/storage.provider');
const models = require('../models');
const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const { hasAnyRole, SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const { ALLOWED_RESOURCE_MIME_TYPES } = require('../config/multer');
const repository = require('../repositories/resources.repository');
const learningResourceProgress = require('./learning-resource-progress.service');
const notificationService = require('./notifications.service');
const { toResource } = require('../dtos/response/resource.response.dto');
const LearningMaterialCategory = require('../enums/learning-material-category.enum');
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

const isHiddenFromMentees = (resource) => [
	LearningMaterialCategory.FACILITATOR_GUIDE,
	LearningMaterialCategory.ANSWER_KEY,
].includes(resource?.category);
const isRequiredLearnerResource = (resource = {}) => (
	Boolean(resource.is_required)
	&& Boolean(resource.module_id)
	&& !isHiddenFromMentees(resource)
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
	moduleId: assignment.module_id ?? null,
	cycleId: assignment.cycle_id ?? null,
	thematicAreaId: assignment.thematic_area_id ?? null,
	completedAt: assignment.completed_at || null,
	revokedAt: assignment.revoked_at || null,
	revokedBy: assignment.revoked_by || null,
});

async function assertMentorThematicAreaAccess(resource, actor) {
	if (normalizeRole(actor?.role) !== Role.MENTOR) {
		throw new AppError('Mentor role required.', 403, 'FORBIDDEN');
	}
	if (!resource) {
		throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	}
	if (!resource.module_id) {
		throw new AppError('This resource is not linked to an active learning module for mentor access.', 403, 'FORBIDDEN');
	}
	if (!Number.isInteger(Number(resource.thematic_area_id)) || Number(resource.thematic_area_id) <= 0) {
		throw new AppError('This resource is not linked to an active thematic area for mentor access.', 403, 'FORBIDDEN');
	}
	const module = await repository.getModuleById(resource.module_id);
	if (!module) {
		throw new AppError('This resource belongs to a learning module that no longer exists.', 404, 'NOT_FOUND');
	}
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('This resource belongs to an unpublished or unauthorized learning module.', 403, 'FORBIDDEN');
	}
	if (Number(module.thematic_area_id) !== Number(resource.thematic_area_id)) {
		throw new AppError('This resource does not match its learning module thematic area.', 403, 'FORBIDDEN');
	}
	const mentor = await models.User.findByPk(actor.id, { attributes: ['id', 'role', 'status'] });
	if (!mentor || normalizeRole(mentor.role) !== Role.MENTOR) {
		throw new AppError('Mentor role required.', 403, 'FORBIDDEN');
	}
	if (mentor.status && normalizeRole(mentor.status) !== 'active') {
		throw new AppError('The mentor account is not active.', 403, 'FORBIDDEN');
	}
	const hasActiveAssignment = await repository.hasActiveMentorThematicAreaAssignment({
		mentorId: actor.id,
		thematicAreaId: resource.thematic_area_id,
	});
	if (!hasActiveAssignment) {
		throw new AppError('You are not assigned to this resource thematic area.', 403, 'FORBIDDEN');
	}
	return resource;
}

async function isMenteeAssignmentAuthorized(assignment, resource, menteeId = assignment?.mentee_id) {
	if (!resource?.module_id || isHiddenFromMentees(resource)) return false;
	const module = await repository.getModuleById(resource.module_id);
	if (!isModulePublishedAndAuthorized(module)
		|| Number(module.thematic_area_id) !== Number(resource.thematic_area_id)) return false;
	if (resource.category === LearningMaterialCategory.PARTICIPANT_MANUAL) {
		return repository.hasActiveMenteeThematicAreaAssignment({
			menteeId,
			thematicAreaId: resource.thematic_area_id,
		});
	}
	if (!assignment || !['active', 'completed'].includes(assignment.assignment_status)
		|| assignment.revoked_at) return false;
	// The active resource assignment is the mentee's access grant. The mentor's
	// module permission is required when assigning/revoking resources, but it is
	// not a separate permission the mentee must retain to consume an assignment.
	return true;
}

async function findResourceAssignment(resourceId, menteeId) {
	return models.ResourceAssignment.findOne({
		where: {
			resource_id: resourceId,
			mentee_id: menteeId,
		},
		order: [['assigned_at', 'DESC'], ['id', 'DESC']],
	});
}

function latestAssignmentPerResource(assignments) {
	const latest = new Map();
	for (const assignment of assignments) {
		if (!latest.has(Number(assignment.resource_id))) {
			latest.set(Number(assignment.resource_id), assignment);
		}
	}
	return [...latest.values()].filter((assignment) => (
		['active', 'completed'].includes(assignment.assignment_status)
	));
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
		throw new AppError('Only PDF, PowerPoint, audio, and video files are supported.', 400, 'UNSUPPORTED_MEDIA_TYPE');
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
	if (isRequiredLearnerResource(payload)
		&& await repository.hasModuleLearningHistory(payload.module_id)) {
		throw new AppError(
			'Required Resources cannot be added after module learning history exists.',
			409,
			'RESOURCE_REQUIREMENTS_LOCKED'
		);
	}

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
			category: payload.category,
			examination_stage: payload.examination_stage,
			is_required: payload.is_required,
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
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		if (resource.module_id) {
			const module = await repository.getModuleById(resource.module_id);
			if (!module || Number(module.thematic_area_id) !== Number(resource.thematic_area_id)) {
				throw new AppError('This resource is outside your facility scope.', 403, 'FORBIDDEN');
			}
		}
		const inFacilityScope = resource.module_id
			? await repository.isModuleInFacilityScope({ moduleId: resource.module_id, facilityId: actor.facility_id })
			: await repository.isThematicAreaInFacilityScope({
				thematicAreaId: resource.thematic_area_id,
				facilityId: actor.facility_id,
			});
		if (!inFacilityScope) {
			throw new AppError('This resource is outside your facility scope.', 403, 'FORBIDDEN');
		}
		return toResource(resource);
	}

	if (role === Role.MENTOR) {
		await assertMentorThematicAreaAccess(resource, actor);
		return toResource(resource);
	}

	if (role === Role.MENTEE) {
		const assignment = await findResourceAssignment(id, actor.id);
		if (!await isMenteeAssignmentAuthorized(assignment, resource, actor.id)) {
			throw new AppError('This resource has not been assigned to you.', 403, 'FORBIDDEN');
		}
		return toResource(resource);
	}

	throw new AppError('You do not have permission to access this resource.', 403, 'FORBIDDEN');
}

async function listResources(query, actor) {
	const parsed = validateList(query);
	const role = normalizeRole(actor?.role);
	let accessibleThematicAreaIds = [];

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
	if (parsed.category !== undefined) where.category = parsed.category;
	if (parsed.examination_stage !== undefined) where.examination_stage = parsed.examination_stage;

	let moduleWhere;
	let answerKeyModuleIds = [];
	if (isSystemAdmin(role)) {
		// System admin can see all matching resources
	} else if (isFacilityAdmin(role)) {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		const facilityThematicAreaIds = await repository.listFacilityThematicAreaIds(actor.facility_id);
		if (!facilityThematicAreaIds.length) {
			return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
		}
		if (parsed.thematic_area_id !== undefined
			&& !facilityThematicAreaIds.includes(Number(parsed.thematic_area_id))) {
			return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
		}
		where.thematic_area_id = parsed.thematic_area_id ?? { [Op.in]: facilityThematicAreaIds };
	} else if (role === Role.MENTOR) {
		accessibleThematicAreaIds = await repository.listActiveMentorThematicAreaIds(actor.id);
		if (!accessibleThematicAreaIds.length) {
			return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
		}

		if (parsed.thematic_area_id !== undefined) {
			const requestedThematicAreaId = Number(parsed.thematic_area_id);
			if (!accessibleThematicAreaIds.includes(requestedThematicAreaId)) {
				return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
			}
			where.thematic_area_id = requestedThematicAreaId;
		} else {
			where.thematic_area_id = { [Op.in]: accessibleThematicAreaIds };
		}
		where.module_id = where.module_id || { [Op.ne]: null };
		moduleWhere = {
			thematic_area_id: { [Op.in]: accessibleThematicAreaIds },
			status: 'published',
			is_published: true,
			is_authorized: true,
		};
	} else if (role === Role.MENTEE) {
		const assignments = await models.ResourceAssignment.findAll({
			where: { mentee_id: actor.id },
			order: [['assigned_at', 'DESC'], ['id', 'DESC']],
		});
		const authorizedResourceIds = (await Promise.all(latestAssignmentPerResource(assignments).map(async (assignment) => {
			const resource = await repository.findById(assignment.resource_id);
			if (!await isMenteeAssignmentAuthorized(assignment, resource, actor.id)) return null;
			return Number(resource.id);
		}))).filter(Boolean);
		const thematicAreaAssignments = await models.Assignment.findAll({
			where: {
				mentee_id: actor.id,
				thematic_area_id: { [Op.ne]: null },
				status: { [Op.in]: ['assigned', 'active'] },
				unassigned_at: null,
			},
			attributes: ['thematic_area_id'],
		});
		const thematicAreaIds = [...new Set(thematicAreaAssignments
			.map((entry) => Number(entry.thematic_area_id))
			.filter((value) => Number.isFinite(value) && value > 0))];
		if (thematicAreaIds.length) {
			const participantManuals = await models.Resource.findAll({
				where: {
					category: LearningMaterialCategory.PARTICIPANT_MANUAL,
					thematic_area_id: { [Op.in]: thematicAreaIds },
				},
				include: [{
					model: models.LearningModule,
					as: 'module',
					required: true,
					where: {
						status: 'published',
						is_published: true,
						is_authorized: true,
						thematic_area_id: { [Op.in]: thematicAreaIds },
					},
					attributes: ['id'],
				}],
				attributes: ['id'],
			});
			authorizedResourceIds.push(...participantManuals.map((resource) => Number(resource.id)));
		}
		const uniqueAuthorizedResourceIds = [...new Set(authorizedResourceIds)];
		if (!uniqueAuthorizedResourceIds.length) {
			return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
		}
		where.id = { [Op.in]: uniqueAuthorizedResourceIds };
	} else {
		throw new AppError('You do not have permission to access resources.', 403, 'FORBIDDEN');
	}

	const offset = (parsed.page - 1) * parsed.limit;
	const { rows, count } = await repository.findAndCountAll({
		where,
		limit: parsed.limit,
		offset,
		order: [['id', 'DESC']],
		moduleWhere,
		requireModule: role === Role.MENTOR,
	});

	const visibleRows = role === Role.MENTOR
		? rows.filter((resource) => {
			if (!resource.thematic_area_id) return false;
			if (!accessibleThematicAreaIds.includes(Number(resource.thematic_area_id))) return false;
			const module = resource.module || null;
			return isModulePublishedAndAuthorized(module)
				&& Number(module.thematic_area_id) === Number(resource.thematic_area_id);
		})
		: rows;

	return {
		items: visibleRows.map(toResource),
		total: role === Role.MENTOR ? visibleRows.length : count,
		page: parsed.page,
		limit: parsed.limit,
		totalPages: role === Role.MENTOR ? Math.ceil(visibleRows.length / parsed.limit) || 0 : Math.ceil(count / parsed.limit) || 0,
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
	const contexts = await repository.listActiveMentorMenteeAssignmentContexts({
		mentorId: actor.id,
		menteeId,
		thematicAreaId: resource.thematicAreaId,
	});
	const uniqueContexts = [...new Map(contexts.map((context) => ([
		`${context.facility_id ?? ''}:${context.cycle_id ?? ''}:${context.thematic_area_id ?? ''}`,
		context,
	]))).values()];
	if (!uniqueContexts.length) {
		throw new AppError('Mentee is not actively assigned to you for this resource thematic area.', 403, 'FORBIDDEN');
	}
	if (uniqueContexts.length > 1) {
		throw new AppError(
			'Multiple active mentor-mentee assignment contexts match this Resource; the cycle context is ambiguous.',
			400,
			'AMBIGUOUS_ASSIGNMENT_CONTEXT'
		);
	}
	const context = uniqueContexts[0];

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
				facility_id: context.facility_id ?? actor.facility_id ?? null,
				module_id: resource.moduleId,
				cycle_id: context.cycle_id ?? null,
				thematic_area_id: context.thematic_area_id ?? null,
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
		await assertMentorThematicAreaAccess(resource, actor);
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

	const assignment = await findResourceAssignment(resourceId, menteeId);
	if (!assignment || Number(assignment.mentor_id) !== Number(actor.id)
		|| !['active', 'completed'].includes(assignment.assignment_status)) {
		throw new AppError('Active resource assignment not found.', 404, 'NOT_FOUND');
	}

	const [updated] = await models.ResourceAssignment.update({
		assignment_status: 'revoked',
		revoked_at: new Date(),
		revoked_by: actor.id,
	}, {
		where: { id: assignment.id, assignment_status: assignment.assignment_status },
	});
	if (!updated) throw new AppError('Resource assignment is no longer active.', 409, 'CONFLICT');

	return { assignmentId: assignment.id, revoked: true };
}

async function revokeResourceAssignmentById(assignmentId, actor) {
	const assignment = await models.ResourceAssignment.findByPk(assignmentId);
	if (!assignment || !['active', 'completed'].includes(assignment.assignment_status)) {
		throw new AppError('Active resource assignment not found.', 404, 'NOT_FOUND');
	}
	const role = normalizeRole(actor?.role);
	if (role === Role.MENTOR) {
		if (Number(assignment.mentor_id) !== Number(actor.id)) {
			throw new AppError('You can only revoke assignments that you created.', 403, 'FORBIDDEN');
		}
	} else if (isSystemAdmin(role)) {
		// System administrators can revoke any active or legacy-completed assignment.
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
	const latestForResource = await findResourceAssignment(assignment.resource_id, assignment.mentee_id);
	if (Number(latestForResource?.id) !== Number(assignment.id)) {
		throw new AppError('Only the latest resource assignment can be revoked.', 409, 'CONFLICT');
	}

	const [updated] = await models.ResourceAssignment.update({
		assignment_status: 'revoked',
		revoked_at: new Date(),
		revoked_by: actor.id,
	}, {
		where: { id: assignment.id, assignment_status: assignment.assignment_status },
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
		if (!resource?.thematic_area_id) continue;
		if (resource.module_id) {
			const module = await repository.getModuleById(resource.module_id);
			if (!isModulePublishedAndAuthorized(module)) continue;
		}
		if (!await repository.hasActiveMentorThematicAreaAssignment({
			mentorId: actor.id,
			thematicAreaId: resource.thematic_area_id,
		})) continue;
		visible.push({ ...toResourceAssignment(assignment), resource: toResource(resource) });
	}
	return visible;
}

async function listModuleResourceAssignments(moduleId, resourceId, actor) {
	const resource = await repository.findById(resourceId);
	if (!resource) throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	if (Number(resource.module_id) !== Number(moduleId)) {
		throw new AppError('Resource does not belong to the requested learning module.', 400, 'RESOURCE_MODULE_MISMATCH');
	}
	await assertMentorThematicAreaAccess(resource, actor);
	const assignments = await models.ResourceAssignment.findAll({
		where: { resource_id: resourceId },
		order: [['assigned_at', 'DESC'], ['id', 'DESC']],
	});
	const visible = [];
	for (const assignment of assignments) {
		if (!await repository.hasActiveMentorThematicAreaAssignment({
			mentorId: actor.id,
			thematicAreaId: resource.thematic_area_id,
		})) continue;
		visible.push({ ...toResourceAssignment(assignment), resource: toResource(resource) });
	}
	return visible;
}

async function listMyResourceAssignments(actor) {
	if (normalizeRole(actor?.role) !== Role.MENTEE) {
		throw new AppError('Mentee role required.', 403, 'FORBIDDEN');
	}
	const assignments = await models.ResourceAssignment.findAll({
		where: { mentee_id: actor.id },
		order: [['assigned_at', 'DESC'], ['id', 'DESC']],
	});
	const visible = [];
	for (const assignment of latestAssignmentPerResource(assignments)) {
		const resource = await repository.findById(assignment.resource_id);
		if (await isMenteeAssignmentAuthorized(assignment, resource, actor.id)) {
			visible.push({ ...toResourceAssignment(assignment), resource: toResource(resource) });
		}
	}
	const thematicAreaAssignments = await models.Assignment.findAll({
		where: {
			mentee_id: actor.id,
			thematic_area_id: { [Op.ne]: null },
			status: { [Op.in]: ['assigned', 'active'] },
			unassigned_at: null,
		},
		attributes: ['thematic_area_id'],
	});
	const thematicAreaIds = [...new Set(thematicAreaAssignments
		.map((entry) => Number(entry.thematic_area_id))
		.filter((value) => Number.isFinite(value) && value > 0))];
	if (thematicAreaIds.length) {
		const participantManuals = await models.Resource.findAll({
			where: {
				category: LearningMaterialCategory.PARTICIPANT_MANUAL,
				thematic_area_id: { [Op.in]: thematicAreaIds },
			},
			include: [{
				model: models.LearningModule,
				as: 'module',
				required: true,
				where: {
					status: 'published',
					is_published: true,
					is_authorized: true,
					thematic_area_id: { [Op.in]: thematicAreaIds },
				},
				attributes: ['id'],
			}],
		});
		const assignedResourceIds = new Set(visible.map((entry) => Number(entry.resourceId)));
		for (const resource of participantManuals) {
			if (assignedResourceIds.has(Number(resource.id))) continue;
			visible.push({
				id: null,
				resourceId: resource.id,
				mentorId: null,
				menteeId: actor.id,
				facilityId: actor.facility_id ?? null,
				status: 'active',
				assignedBy: null,
				assignedAt: null,
				moduleId: resource.module_id ?? null,
				cycleId: null,
				thematicAreaId: resource.thematic_area_id ?? null,
				completedAt: null,
				revokedAt: null,
				revokedBy: null,
				resource: toResource(resource),
			});
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
	const assignment = await findResourceAssignment(resourceId, actor.id);
	if (!assignment || !['active', 'completed'].includes(assignment.assignment_status)
		|| !await isMenteeAssignmentAuthorized(assignment, resource)) {
		throw new AppError('Active resource assignment not found.', 404, 'NOT_FOUND');
	}
	return sequelize.transaction(async (transaction) => {
		const current = await models.ResourceAssignment.findByPk(assignment.id, {
			transaction,
			lock: transaction.LOCK.UPDATE,
		});
		if (!current || !['active', 'completed'].includes(current.assignment_status)
			|| current.revoked_at) {
			throw new AppError('Active resource assignment not found.', 404, 'NOT_FOUND');
		}
		if (current.assignment_status === 'active' && !current.completed_at) {
			const [updated] = await models.ResourceAssignment.update({
				completed_at: new Date(),
			}, {
				where: { id: current.id, assignment_status: 'active', completed_at: null },
				transaction,
			});
			if (!updated) throw new AppError('The resource assignment is no longer active.', 409, 'CONFLICT');
			await current.reload({ transaction });
		}
		const hasScopeSnapshot = [
			current.module_id,
			current.cycle_id,
			current.facility_id,
			current.thematic_area_id,
		].every((value) => Number.isSafeInteger(Number(value)) && Number(value) > 0);
		if (hasScopeSnapshot) {
			await learningResourceProgress.refreshAfterResourceCompletion({
				menteeId: actor.id,
				assignment: current,
				transaction,
			});
		} else if (current.assignment_status !== 'completed') {
			throw new AppError(
				'Resource assignment is missing a valid mentorship scope snapshot.',
				409,
				'INVALID_ASSIGNMENT_CONTEXT'
			);
		}
		return {
			...toResourceAssignment(current),
			completed: Boolean(current.completed_at) || current.assignment_status === 'completed',
		};
	});
}

async function updateResource(id, body, actor) {
	assertCanManageResources(actor);
	const existing = await repository.findById(id);
	if (!existing) {
		throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	}
	const payload = validateUpdate(body, existing);

	await assertCanManageResourceRecord(existing, actor);

	const nextModuleId = payload.module_id !== undefined ? payload.module_id : existing.module_id;
	const nextRequired = payload.is_required !== undefined ? payload.is_required : existing.is_required;
	const nextCategory = payload.category !== undefined ? payload.category : existing.category;
	const assignmentHistory = await repository.countAssignmentsForResource(id);
	if (assignmentHistory > 0
		&& ((payload.module_id !== undefined && Number(nextModuleId) !== Number(existing.module_id))
			|| (payload.is_required !== undefined && Boolean(nextRequired) !== Boolean(existing.is_required)))) {
		throw new AppError(
			'Resource module and required status cannot change after assignment history exists.',
			409,
			'RESOURCE_REQUIREMENTS_LOCKED'
		);
	}
	const oldRequired = isRequiredLearnerResource(existing);
	const newRequired = isRequiredLearnerResource({
		module_id: nextModuleId,
		is_required: nextRequired,
		category: nextCategory,
	});
	const denominatorChanges = oldRequired !== newRequired
		|| (oldRequired && Number(existing.module_id) !== Number(nextModuleId));
	if (denominatorChanges) {
		const affectedModules = [...new Set([existing.module_id, nextModuleId].filter(Boolean).map(Number))];
		for (const moduleId of affectedModules) {
			if (await repository.hasModuleLearningHistory(moduleId)) {
				throw new AppError(
					'Required Resource changes are locked after module learning history exists.',
					409,
					'RESOURCE_REQUIREMENTS_LOCKED'
				);
			}
		}
	}

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
	if (await repository.countAssignmentsForResource(id)) {
		throw new AppError(
			'Resources with assignment history cannot be deleted.',
			409,
			'RESOURCE_HISTORY_LOCKED'
		);
	}
	if (isRequiredLearnerResource(existing)
		&& await repository.hasModuleLearningHistory(existing.module_id)) {
		throw new AppError(
			'Required Resources cannot be deleted after module learning history exists.',
			409,
			'RESOURCE_REQUIREMENTS_LOCKED'
		);
	}

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
