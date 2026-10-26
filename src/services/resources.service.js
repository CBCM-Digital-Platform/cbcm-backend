const { Op } = require('sequelize');
const { sequelize } = require('../models');
const storage = require('../providers/storage.provider');
const models = require('../models');
const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const LearningPermission = require('../enums/learning-permission.enum');
const { hasAnyRole, FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');
const { ALLOWED_RESOURCE_MIME_TYPES } = require('../config/multer');
const repository = require('../repositories/resources.repository');
const { toResource } = require('../dtos/response/resource.response.dto');
const {
	validateCreate,
	validateUpdate,
	validateList,
} = require('../validators/resources.validator');

const normalizeRole = (role) => String(role || '').toLowerCase();
const isSystemAdmin = (role) => normalizeRole(role) === Role.ADMIN;
const isFacilityAdmin = (role) => normalizeRole(role) === Role.FACILITY_ADMIN;

const isModulePublishedAndAuthorized = (module) => (
	Boolean(module?.is_published)
	&& Boolean(module?.is_authorized)
	&& String(module?.status || '').toLowerCase() === 'published'
);

function assertCanManageResources(actor) {
	if (!actor || !hasAnyRole(actor.role, FACILITY_MANAGEMENT_ROLES)) {
		throw new AppError('You do not have permission to manage resources.', 403, 'FORBIDDEN');
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

	if (isFacilityAdmin(actor?.role)) {
		if (resource.module_id) {
			const inScope = await repository.isModuleInFacilityScope({
				moduleId: resource.module_id,
				facilityId: actor.facility_id,
			});
			if (!inScope) {
				throw new AppError('You do not have permission to modify this resource.', 403, 'FORBIDDEN');
			}
		} else if (resource.thematic_area_id) {
			const inScope = await repository.isThematicAreaInFacilityScope({
				thematicAreaId: resource.thematic_area_id,
				facilityId: actor.facility_id,
			});
			if (!inScope) {
				throw new AppError('You do not have permission to modify this resource.', 403, 'FORBIDDEN');
			}
		} else {
			throw new AppError('You do not have permission to modify this resource.', 403, 'FORBIDDEN');
		}
	}
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
			throw new AppError('You do not have permission to access this resource.', 403, 'FORBIDDEN');
		}
		const module = resource.module || (await repository.getModuleById(resource.module_id));
		if (!isModulePublishedAndAuthorized(module)) {
			throw new AppError('This resource belongs to an unpublished or unauthorized learning module.', 403, 'FORBIDDEN');
		}
		const hasPermission = await repository.hasModuleMentorPermission({
			mentorId: actor.id,
			moduleId: resource.module_id,
			permission: LearningPermission.RESOURCES_VIEW,
		});
		if (!hasPermission) {
			throw new AppError('You do not have permission to view resources for this module.', 403, 'FORBIDDEN');
		}
		const hasAssignment = await repository.hasActiveMentorAssignment({
			mentorId: actor.id,
			moduleId: resource.module_id,
		});
		if (!hasAssignment) {
			throw new AppError('You are not assigned to this module thematic area.', 403, 'FORBIDDEN');
		}
		return toResource(resource);
	}

	if (role === Role.MENTEE) {
		if (!resource.module_id) {
			throw new AppError('You do not have permission to access this resource.', 403, 'FORBIDDEN');
		}
		const module = resource.module || (await repository.getModuleById(resource.module_id));
		if (!isModulePublishedAndAuthorized(module)) {
			throw new AppError('This resource belongs to an unpublished or unauthorized learning module.', 403, 'FORBIDDEN');
		}
		const progress = await repository.getModuleProgress({
			menteeId: actor.id,
			moduleId: resource.module_id,
		});
		if (!progress) {
			throw new AppError('You do not have access to this learning module.', 403, 'FORBIDDEN');
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
				const [module, assigned] = await Promise.all([
					repository.getModuleById(moduleId),
					repository.hasActiveMentorAssignment({ mentorId: actor.id, moduleId }),
				]);
				if (!module || !isModulePublishedAndAuthorized(module) || !assigned) return null;
				return moduleId;
			})
		)).filter(Boolean);

		if (eligibleIds.length === 0) {
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
		let menteeModuleIds = [];
		if (models.LearningModuleProgress) {
			const progressRecords = await models.LearningModuleProgress.findAll({
				where: { mentee_id: actor.id },
				attributes: ['module_id'],
			});
			menteeModuleIds = [...new Set(progressRecords.map((r) => r.module_id))];
		}

		const eligibleIds = (await Promise.all(
			menteeModuleIds.map(async (moduleId) => {
				const module = await repository.getModuleById(moduleId);
				if (!module || !isModulePublishedAndAuthorized(module)) return null;
				return moduleId;
			})
		)).filter(Boolean);

		if (eligibleIds.length === 0) {
			return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
		}

		if (where.module_id !== undefined) {
			if (!eligibleIds.includes(where.module_id)) {
				return { items: [], total: 0, page: parsed.page, limit: parsed.limit, totalPages: 0 };
			}
		} else {
			where.module_id = { [Op.in]: eligibleIds };
		}
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
		if (isFacilityAdmin(actor?.role)) {
			const inScope = await repository.isThematicAreaInFacilityScope({
				thematicAreaId: payload.thematic_area_id,
				facilityId: actor.facility_id,
			});
			if (!inScope) {
				throw new AppError('The thematic area is outside your facility scope.', 403, 'FORBIDDEN');
			}
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
	openResourceFile,
	isModulePublishedAndAuthorized,
};
