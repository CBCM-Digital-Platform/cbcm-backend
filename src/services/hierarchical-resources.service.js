const { Op } = require('sequelize');
const { sequelize } = require('../models');
const storage = require('../providers/storage.provider');
const models = require('../models');
const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const { SYSTEM_ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../constants/roles.constants');
const { inspectUploadedFile, resourceUpload } = require('../config/multer');
const repository = require('../repositories/hierarchical-resources.repository');

const normalizeRole = (role) => String(role || '').toLowerCase();
const isSystemAdmin = (role) => SYSTEM_ADMIN_ROLES.includes(normalizeRole(role));
const isFacilityAdmin = (role) => FACILITY_ADMIN_ROLES.includes(normalizeRole(role));

function assertSuperAdmin(actor) {
	if (!isSystemAdmin(actor?.role)) {
		throw new AppError('Super Admin role required.', 403, 'FORBIDDEN');
	}
}

function assertFacilityAdmin(actor) {
	if (!isFacilityAdmin(actor?.role)) {
		throw new AppError('Facility Admin role required.', 403, 'FORBIDDEN');
	}
}

async function createResource(file, metadata, actor) {
	assertSuperAdmin(actor);
	
	const inspected = inspectUploadedFile(file);
	const stored = await storage.getStorageProvider().store({
		body: inspected.body,
		mimeType: inspected.mimeType,
	});

	const uploadedFile = await models.UploadedFile.create({
		owner_id: actor.id,
		context: 'hierarchical_resource',
		storage_key: stored.storageKey,
		mime_type: inspected.mimeType,
		size_bytes: inspected.sizeBytes,
	});

	const resource = await sequelize.transaction(async (transaction) => {
		return models.HierarchicalResource.create({
			title: metadata.title,
			description: metadata.description,
			type: inspected.kind,
			uploaded_file_id: uploadedFile.id,
			original_filename: inspected.originalName,
			verified_mime_type: inspected.mimeType,
			file_size_bytes: inspected.sizeBytes,
			upload_status: 'completed',
			publication_status: metadata.publication_status || 'draft',
			created_by: actor.id,
			updated_by: actor.id,
		}, { transaction });
	});

	return repository.findById(resource.id);
}

async function listResources(query, actor) {
	const role = normalizeRole(actor?.role);
	const { page = 1, limit = 20, type, status, search } = query;

	if (isSystemAdmin(role)) {
		return repository.findAll({ page, limit, type, status, search });
	}

	if (isFacilityAdmin(role)) {
		return repository.findForFacility(actor.facility_id, { page, limit, type, status, search });
	}

	if (role === Role.MENTOR) {
		return repository.findForMentor(actor.id, actor.facility_id, { page, limit, type, status, search });
	}

	if (role === Role.MENTEE) {
		return repository.findForMentee(actor.id, { page, limit, type, status, search });
	}

	throw new AppError('Unauthorized.', 403, 'FORBIDDEN');
}

async function getResource(id, actor) {
	const resource = await repository.findById(id);
	if (!resource) {
		throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	}

	const role = normalizeRole(actor?.role);

	if (isSystemAdmin(role)) {
		return resource;
	}

	if (isFacilityAdmin(role)) {
		const hasAccess = await repository.checkFacilityAccess(id, actor.facility_id);
		if (!hasAccess) {
			throw new AppError('Resource not found.', 404, 'NOT_FOUND');
		}
		return resource;
	}

	if (role === Role.MENTOR) {
		const hasAccess = await repository.checkMentorAccess(id, actor.id);
		if (!hasAccess) {
			throw new AppError('Resource not found.', 404, 'NOT_FOUND');
		}
		return resource;
	}

	if (role === Role.MENTEE) {
		const hasAccess = await repository.checkMenteeAccess(id, actor.id);
		if (!hasAccess) {
			throw new AppError('Resource not found.', 404, 'NOT_FOUND');
		}
		return resource;
	}

	throw new AppError('Unauthorized.', 403, 'FORBIDDEN');
}

async function grantToFacility(resourceId, facilityIds, actor) {
	assertSuperAdmin(actor);
	
	const resource = await repository.findById(resourceId);
	if (!resource) {
		throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	}

	const grants = await sequelize.transaction(async (transaction) => {
		const results = [];
		for (const facilityId of facilityIds) {
			const existing = await models.FacilityResourceGrant.findOne({
				where: { resource_id: resourceId, facility_id: facilityId, grant_status: 'active' },
				transaction,
			});
			if (!existing) {
				const grant = await models.FacilityResourceGrant.create({
					resource_id: resourceId,
					facility_id: facilityId,
					granted_by: actor.id,
					grant_status: 'active',
					granted_at: new Date(),
				}, { transaction });
				results.push(grant);
			}
		}
		return results;
	});

	return { granted: grants.length };
}

async function revokeFromFacility(resourceId, facilityId, actor) {
	assertSuperAdmin(actor);
	
	const grant = await models.FacilityResourceGrant.findOne({
		where: { resource_id: resourceId, facility_id: facilityId, grant_status: 'active' },
	});
	if (!grant) {
		throw new AppError('Active grant not found.', 404, 'NOT_FOUND');
	}

	await sequelize.transaction(async (transaction) => {
		await models.FacilityResourceGrant.update({
			grant_status: 'revoked',
			revoked_at: new Date(),
			revoked_by: actor.id,
		}, { where: { id: grant.id }, transaction });

		await models.MentorResourceGrant.update(
			{ grant_status: 'revoked', revoked_at: new Date(), revoked_by: actor.id },
			{ where: { resource_id: resourceId, facility_id: facilityId, grant_status: 'active' }, transaction }
		);

		await models.MenteeResourceAssignment.update(
			{ assignment_status: 'revoked', revoked_at: new Date(), revoked_by: actor.id },
			{ where: { resource_id: resourceId, facility_id: facilityId, assignment_status: 'active' }, transaction }
		);
	});

	return { revoked: true };
}

async function grantToMentor(resourceId, mentorIds, actor) {
	assertFacilityAdmin(actor);
	
	const resource = await repository.findById(resourceId);
	if (!resource) {
		throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	}

	const hasFacilityAccess = await repository.checkFacilityAccess(resourceId, actor.facility_id);
	if (!hasFacilityAccess) {
		throw new AppError('Resource not available to your facility.', 403, 'FORBIDDEN');
	}

	const grants = await sequelize.transaction(async (transaction) => {
		const results = [];
		for (const mentorId of mentorIds) {
			const mentor = await models.User.findOne({
				where: { id: mentorId, role: Role.MENTOR, facility_id: actor.facility_id, status: 'active' },
				transaction,
			});
			if (!mentor) {
				continue;
			}

			const existing = await models.MentorResourceGrant.findOne({
				where: { resource_id: resourceId, mentor_id: mentorId, grant_status: 'active' },
				transaction,
			});
			if (!existing) {
				const grant = await models.MentorResourceGrant.create({
					resource_id: resourceId,
					facility_id: actor.facility_id,
					mentor_id: mentorId,
					granted_by: actor.id,
					grant_status: 'active',
					granted_at: new Date(),
				}, { transaction });
				results.push(grant);
			}
		}
		return results;
	});

	return { granted: grants.length };
}

async function revokeFromMentor(resourceId, mentorId, actor) {
	assertFacilityAdmin(actor);
	
	const grant = await models.MentorResourceGrant.findOne({
		where: { resource_id: resourceId, mentor_id: mentorId, facility_id: actor.facility_id, grant_status: 'active' },
	});
	if (!grant) {
		throw new AppError('Active grant not found.', 404, 'NOT_FOUND');
	}

	await sequelize.transaction(async (transaction) => {
		await models.MentorResourceGrant.update({
			grant_status: 'revoked',
			revoked_at: new Date(),
			revoked_by: actor.id,
		}, { where: { id: grant.id }, transaction });

		await models.MenteeResourceAssignment.update(
			{ assignment_status: 'revoked', revoked_at: new Date(), revoked_by: actor.id },
			{ where: { resource_id: resourceId, mentor_id: mentorId, assignment_status: 'active' }, transaction }
		);
	});

	return { revoked: true };
}

async function assignToMentee(resourceId, menteeIds, actor) {
	const role = normalizeRole(actor?.role);
	if (role !== Role.MENTOR) {
		throw new AppError('Mentor role required.', 403, 'FORBIDDEN');
	}

	const resource = await repository.findById(resourceId);
	if (!resource) {
		throw new AppError('Resource not found.', 404, 'NOT_FOUND');
	}

	const hasAccess = await repository.checkMentorAccess(resourceId, actor.id);
	if (!hasAccess) {
		throw new AppError('You do not have access to this resource.', 403, 'FORBIDDEN');
	}

	const assignments = await sequelize.transaction(async (transaction) => {
		const results = [];
		for (const menteeId of menteeIds) {
			const assignment = await models.Assignment.findOne({
				where: { mentor_id: actor.id, mentee_id: menteeId, status: 'active' },
				transaction,
			});
			if (!assignment) {
				throw new AppError('Mentee is not assigned to you.', 403, 'FORBIDDEN');
			}

			const existing = await models.MenteeResourceAssignment.findOne({
				where: { resource_id: resourceId, mentee_id: menteeId, assignment_status: 'active' },
				transaction,
			});
			if (!existing) {
				const newAssignment = await models.MenteeResourceAssignment.create({
					resource_id: resourceId,
					mentor_id: actor.id,
					mentee_id: menteeId,
					facility_id: actor.facility_id,
					assigned_by: actor.id,
					assignment_status: 'active',
					assigned_at: new Date(),
				}, { transaction });
				results.push(newAssignment);
			}
		}
		return results;
	});

	return { assigned: assignments.length };
}

async function revokeFromMentee(resourceId, menteeId, actor) {
	const role = normalizeRole(actor?.role);
	if (role !== Role.MENTOR) {
		throw new AppError('Mentor role required.', 403, 'FORBIDDEN');
	}

	const assignment = await models.MenteeResourceAssignment.findOne({
		where: { resource_id: resourceId, mentee_id: menteeId, mentor_id: actor.id, assignment_status: 'active' },
	});
	if (!assignment) {
		throw new AppError('Active assignment not found.', 404, 'NOT_FOUND');
	}

	await models.MenteeResourceAssignment.update({
		assignment_status: 'revoked',
		revoked_at: new Date(),
		revoked_by: actor.id,
	}, { where: { id: assignment.id } });

	return { revoked: true };
}

async function openResourceFile(id, actor) {
	const resource = await getResource(id, actor);
	if (!resource?.uploaded_file_id) {
		throw new AppError('No file attached.', 404, 'FILE_NOT_FOUND');
	}
	const file = await models.UploadedFile.findByPk(resource.uploaded_file_id);
	if (!file) {
		throw new AppError('File not found.', 404, 'FILE_NOT_FOUND');
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
	listResources,
	getResource,
	grantToFacility,
	revokeFromFacility,
	grantToMentor,
	revokeFromMentor,
	assignToMentee,
	revokeFromMentee,
	openResourceFile,
};
