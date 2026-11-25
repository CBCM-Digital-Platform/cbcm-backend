const { Op } = require('sequelize');
const models = require('../models');
const learningRepository = require('./learning.repository');

const SAFE_FILE_ATTRIBUTES = ['id', 'owner_id', 'mime_type', 'size_bytes', 'created_at'];
const SAFE_MODULE_ATTRIBUTES = ['id', 'title', 'thematic_area_id', 'status', 'is_published', 'is_authorized'];
const SAFE_THEMATIC_AREA_ATTRIBUTES = ['id', 'code', 'name'];

const standardIncludes = [
	{
		model: models.LearningModule,
		as: 'module',
		required: false,
		attributes: SAFE_MODULE_ATTRIBUTES,
	},
	{
		model: models.ThematicArea,
		as: 'thematicArea',
		required: false,
		attributes: SAFE_THEMATIC_AREA_ATTRIBUTES,
	},
	{
		model: models.UploadedFile,
		as: 'file',
		required: false,
		attributes: SAFE_FILE_ATTRIBUTES,
	},
];

async function create(data, transaction) {
	return models.Resource.create(data, { transaction });
}

async function findById(id, { transaction } = {}) {
	return models.Resource.findByPk(id, {
		include: standardIncludes,
		transaction,
	});
}

async function findAndCountAll({
	where = {},
	limit = 20,
	offset = 0,
	order = [['id', 'DESC']],
	moduleWhere,
	requireModule = false,
	transaction,
} = {}) {
	const include = standardIncludes.map((entry) => (
		entry.as === 'module' && moduleWhere
			? { ...entry, where: moduleWhere, required: requireModule }
			: entry
	));
	return models.Resource.findAndCountAll({
		where,
		limit,
		offset,
		order,
		include,
		distinct: true,
		transaction,
	});
}

async function update(id, data, transaction) {
	await models.Resource.update(data, {
		where: { id },
		transaction,
	});
	return findById(id, { transaction });
}

async function destroy(id, transaction) {
	// Clean up any dependent views or starred bookmarks for this resource
	if (models.ResourceView) {
		await models.ResourceView.destroy({ where: { resource_id: id }, transaction });
	}
	if (models.StarredResource) {
		await models.StarredResource.destroy({ where: { resource_id: id }, transaction });
	}
	// Delete resource record only; strictly preserve UploadedFile and storage object
	return models.Resource.destroy({
		where: { id },
		transaction,
	});
}

async function countAssignmentsForResource(resourceId, transaction) {
	return models.ResourceAssignment.count({ where: { resource_id: resourceId }, transaction });
}

async function hasModuleLearningHistory(moduleId, transaction) {
	const [moduleProgress, contentProgress] = await Promise.all([
		models.LearningModuleProgress.count({
			where: {
				module_id: moduleId,
				[Op.or]: [
					{ started_at: { [Op.ne]: null } },
					{ completed_at: { [Op.ne]: null } },
					{ completion_percentage: { [Op.gt]: 0 } },
				],
			},
			transaction,
		}),
		models.LearningContentProgress.count({ where: { module_id: moduleId }, transaction }),
	]);
	return moduleProgress > 0 || contentProgress > 0;
}

async function getFileById(fileId) {
	if (!models.UploadedFile) return null;
	return models.UploadedFile.findByPk(fileId, {
		attributes: SAFE_FILE_ATTRIBUTES,
	});
}

async function getModuleById(moduleId) {
	if (!models.LearningModule) return null;
	return models.LearningModule.findByPk(moduleId, {
		attributes: ['id', 'title', 'thematic_area_id', 'status', 'is_published', 'is_authorized', 'created_by'],
	});
}

async function getThematicAreaById(thematicAreaId) {
	if (!models.ThematicArea) return null;
	return models.ThematicArea.findByPk(thematicAreaId, {
		attributes: SAFE_THEMATIC_AREA_ATTRIBUTES,
	});
}

async function listActiveMentorThematicAreaIds(mentorId) {
	if (!mentorId || !models.Assignment || !models.User) return [];
	const mentor = await models.User.findByPk(mentorId, {
		attributes: ['id', 'role', 'status'],
	});
	if (!mentor || String(mentor.role || '').toLowerCase() !== 'mentor') return [];
	if (mentor.status && String(mentor.status).toLowerCase() !== 'active') return [];

	const assignments = await models.Assignment.findAll({
		where: {
			mentor_id: mentorId,
			thematic_area_id: { [Op.ne]: null },
			status: { [Op.in]: ['assigned', 'active'] },
			unassigned_at: null,
		},
		attributes: ['thematic_area_id'],
	});

	return [...new Set(assignments
		.map((entry) => Number(entry.thematic_area_id))
		.filter((value) => Number.isFinite(value) && value > 0))];
}

async function hasActiveMentorThematicAreaAssignment({ mentorId, thematicAreaId }) {
	if (!mentorId || !thematicAreaId || !models.Assignment) return false;
	const mentor = await models.User.findByPk(mentorId, {
		attributes: ['id', 'role', 'status'],
	});
	if (!mentor || String(mentor.role || '').toLowerCase() !== 'mentor') return false;
	if (mentor.status && String(mentor.status).toLowerCase() !== 'active') return false;

	const assignment = await models.Assignment.findOne({
		where: {
			mentor_id: mentorId,
			thematic_area_id: Number(thematicAreaId),
			status: { [Op.in]: ['assigned', 'active'] },
			unassigned_at: null,
		},
		attributes: ['id'],
	});
	return Boolean(assignment);
}

async function hasActiveMenteeThematicAreaAssignment({ menteeId, thematicAreaId }) {
	if (!menteeId || !thematicAreaId || !models.Assignment) return false;
	const mentee = await models.User.findByPk(menteeId, {
		attributes: ['id', 'role', 'status'],
	});
	if (!mentee || String(mentee.role || '').toLowerCase() !== 'mentee') return false;
	if (mentee.status && String(mentee.status).toLowerCase() !== 'active') return false;

	const assignment = await models.Assignment.findOne({
		where: {
			mentee_id: menteeId,
			thematic_area_id: Number(thematicAreaId),
			status: { [Op.in]: ['assigned', 'active'] },
			unassigned_at: null,
		},
		attributes: ['id'],
	});
	return Boolean(assignment);
}

async function listActiveMentorMenteeAssignmentContexts({ mentorId, menteeId, thematicAreaId }) {
	const [mentor, mentee] = await Promise.all([
		models.User.findByPk(mentorId, { attributes: ['id', 'role', 'facility_id'] }),
		models.User.findByPk(menteeId, { attributes: ['id', 'role', 'facility_id'] }),
	]);
	if (!mentor || String(mentor.role || '').toLowerCase() !== 'mentor'
		|| !mentee || String(mentee.role || '').toLowerCase() !== 'mentee') return [];
	if (mentor.facility_id && mentee.facility_id
		&& Number(mentor.facility_id) !== Number(mentee.facility_id)) return [];

	const where = {
		mentor_id: mentorId,
		mentee_id: menteeId,
		thematic_area_id: thematicAreaId,
		status: { [Op.in]: ['assigned', 'active'] },
		unassigned_at: null,
	};
	if (mentor.facility_id) where.facility_id = mentor.facility_id;

	return models.Assignment.findAll({
		where,
		attributes: ['id', 'mentor_id', 'mentee_id', 'facility_id', 'cycle_id', 'thematic_area_id'],
		order: [['assigned_at', 'DESC'], ['id', 'DESC']],
	});
}

async function listFacilityThematicAreaIds(facilityId) {
	if (!facilityId || !models.CycleFacility || !models.CycleThematicArea) return [];
	const facilityCycles = await models.CycleFacility.findAll({
		where: { facility_id: facilityId },
		attributes: ['cycle_id'],
	});
	if (!facilityCycles.length) return [];
	const cycleIds = facilityCycles.map((entry) => entry.cycle_id);
	const cycleThematicAreas = await models.CycleThematicArea.findAll({
		where: { cycle_id: { [Op.in]: cycleIds } },
		attributes: ['thematic_area_id'],
	});
	return [...new Set(cycleThematicAreas.map((entry) => Number(entry.thematic_area_id)))];
}

module.exports = {
	create,
	findById,
	findAndCountAll,
	update,
	destroy,
	countAssignmentsForResource,
	hasModuleLearningHistory,
	getFileById,
	getModuleById,
	getThematicAreaById,
	listFacilityThematicAreaIds,
	listActiveMentorThematicAreaIds,
	hasActiveMentorThematicAreaAssignment,
	hasActiveMenteeThematicAreaAssignment,
	listActiveMentorMenteeAssignmentContexts,
	// Re-exported learning repository helpers for testing stubbing and scope checks
	isModuleInFacilityScope: (...args) => learningRepository.isModuleInFacilityScope(...args),
	isThematicAreaInFacilityScope: (...args) => learningRepository.isThematicAreaInFacilityScope(...args),
	listModuleIdsForFacility: (...args) => learningRepository.listModuleIdsForFacility(...args),
	listMentorModuleIds: (...args) => learningRepository.listMentorModuleIds(...args),
	hasActiveMentorAssignment: (...args) => learningRepository.hasActiveMentorAssignment(...args),
	hasModuleMentorAccess: (...args) => learningRepository.hasModuleMentorAccess(...args),
	getModuleProgress: (...args) => learningRepository.getModuleProgress(...args),
};
