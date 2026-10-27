const { Op } = require('sequelize');
const models = require('../models');

const SAFE_FILE_ATTRIBUTES = ['id', 'owner_id', 'mime_type', 'size_bytes', 'created_at'];
const SAFE_RESOURCE_ATTRIBUTES = [
	'id', 'title', 'description', 'type', 'original_filename', 
	'verified_mime_type', 'file_size_bytes', 'upload_status', 'publication_status',
	'created_by', 'updated_by', 'archived_at', 'archived_by', 'created_at', 'updated_at'
];

const standardIncludes = [
	{
		model: models.UploadedFile,
		as: 'uploadedFile',
		required: false,
		attributes: SAFE_FILE_ATTRIBUTES,
	},
];

async function findById(id) {
	return models.HierarchicalResource.findByPk(id, {
		include: standardIncludes,
		attributes: SAFE_RESOURCE_ATTRIBUTES,
	});
}

async function findAll({ page = 1, limit = 20, type, status, search } = {}) {
	const where = {};
	if (type) where.type = type;
	if (status) where.publication_status = status;
	if (search) {
		where[Op.or] = [
			{ title: { [Op.iLike]: `%${search}%` } },
			{ description: { [Op.iLike]: `%${search}%` } },
		];
	}

	const offset = (page - 1) * limit;
	const { rows, count } = await models.HierarchicalResource.findAndCountAll({
		where,
		limit,
		offset,
		order: [['id', 'DESC']],
		include: standardIncludes,
		attributes: SAFE_RESOURCE_ATTRIBUTES,
		distinct: true,
	});

	return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) || 0 };
}

async function findForFacility(facilityId, { page = 1, limit = 20, type, status, search } = {}) {
	const where = {
		publication_status: 'published',
	};
	if (type) where.type = type;
	if (status) where.publication_status = status;
	if (search) {
		where[Op.or] = [
			{ title: { [Op.iLike]: `%${search}%` } },
			{ description: { [Op.iLike]: `%${search}%` } },
		];
	}

	const facilityGrantIds = await models.FacilityResourceGrant.findAll({
		where: { facility_id: facilityId, grant_status: 'active' },
		attributes: ['resource_id'],
	}).then(grants => grants.map(g => g.resource_id));

	if (facilityGrantIds.length === 0) {
		return { items: [], total: 0, page, limit, totalPages: 0 };
	}

	where.id = { [Op.in]: facilityGrantIds };

	const offset = (page - 1) * limit;
	const { rows, count } = await models.HierarchicalResource.findAndCountAll({
		where,
		limit,
		offset,
		order: [['id', 'DESC']],
		include: standardIncludes,
		attributes: SAFE_RESOURCE_ATTRIBUTES,
		distinct: true,
	});

	return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) || 0 };
}

async function findForMentor(mentorId, facilityId, { page = 1, limit = 20, type, status, search } = {}) {
	const where = {
		publication_status: 'published',
	};
	if (type) where.type = type;
	if (status) where.publication_status = status;
	if (search) {
		where[Op.or] = [
			{ title: { [Op.iLike]: `%${search}%` } },
			{ description: { [Op.iLike]: `%${search}%` } },
		];
	}

	const mentorGrantIds = await models.MentorResourceGrant.findAll({
		where: { mentor_id: mentorId, grant_status: 'active' },
		attributes: ['resource_id'],
	}).then(grants => grants.map(g => g.resource_id));

	if (mentorGrantIds.length === 0) {
		return { items: [], total: 0, page, limit, totalPages: 0 };
	}

	where.id = { [Op.in]: mentorGrantIds };

	const offset = (page - 1) * limit;
	const { rows, count } = await models.HierarchicalResource.findAndCountAll({
		where,
		limit,
		offset,
		order: [['id', 'DESC']],
		include: standardIncludes,
		attributes: SAFE_RESOURCE_ATTRIBUTES,
		distinct: true,
	});

	return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) || 0 };
}

async function findForMentee(menteeId, { page = 1, limit = 20, type, status, search } = {}) {
	const where = {
		publication_status: 'published',
	};
	if (type) where.type = type;
	if (status) where.publication_status = status;
	if (search) {
		where[Op.or] = [
			{ title: { [Op.iLike]: `%${search}%` } },
			{ description: { [Op.iLike]: `%${search}%` } },
		];
	}

	const assignmentIds = await models.MenteeResourceAssignment.findAll({
		where: { mentee_id: menteeId, assignment_status: 'active' },
		attributes: ['resource_id'],
	}).then(assignments => assignments.map(a => a.resource_id));

	if (assignmentIds.length === 0) {
		return { items: [], total: 0, page, limit, totalPages: 0 };
	}

	where.id = { [Op.in]: assignmentIds };

	const offset = (page - 1) * limit;
	const { rows, count } = await models.HierarchicalResource.findAndCountAll({
		where,
		limit,
		offset,
		order: [['id', 'DESC']],
		include: standardIncludes,
		attributes: SAFE_RESOURCE_ATTRIBUTES,
		distinct: true,
	});

	return { items: rows, total: count, page, limit, totalPages: Math.ceil(count / limit) || 0 };
}

async function checkFacilityAccess(resourceId, facilityId) {
	const grant = await models.FacilityResourceGrant.findOne({
		where: { resource_id: resourceId, facility_id, grant_status: 'active' },
	});
	return !!grant;
}

async function checkMentorAccess(resourceId, mentorId) {
	const grant = await models.MentorResourceGrant.findOne({
		where: { resource_id: resourceId, mentor_id, grant_status: 'active' },
	});
	return !!grant;
}

async function checkMenteeAccess(resourceId, menteeId) {
	const assignment = await models.MenteeResourceAssignment.findOne({
		where: { resource_id: resourceId, mentee_id, assignment_status: 'active' },
	});
	return !!assignment;
}

async function getFacilityGrants(resourceId) {
	return models.FacilityResourceGrant.findAll({
		where: { resource_id: resourceId, grant_status: 'active' },
		include: [
			{ model: models.Facility, as: 'facility' },
			{ model: models.User, as: 'grantedBy', attributes: ['id', 'full_name', 'email'] },
		],
	});
}

async function getMentorGrants(resourceId, facilityId) {
	return models.MentorResourceGrant.findAll({
		where: { resource_id: resourceId, facility_id, grant_status: 'active' },
		include: [
			{ model: models.User, as: 'mentor', attributes: ['id', 'full_name', 'email'] },
			{ model: models.User, as: 'grantedBy', attributes: ['id', 'full_name', 'email'] },
		],
	});
}

async function getMenteeAssignments(resourceId, mentorId) {
	return models.MenteeResourceAssignment.findAll({
		where: { resource_id: resourceId, mentor_id, assignment_status: 'active' },
		include: [
			{ model: models.User, as: 'mentee', attributes: ['id', 'full_name', 'email'] },
			{ model: models.User, as: 'assignedBy', attributes: ['id', 'full_name', 'email'] },
		],
	});
}

module.exports = {
	findById,
	findAll,
	findForFacility,
	findForMentor,
	findForMentee,
	checkFacilityAccess,
	checkMentorAccess,
	checkMenteeAccess,
	getFacilityGrants,
	getMentorGrants,
	getMenteeAssignments,
};
