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

async function findAndCountAll({ where = {}, limit = 20, offset = 0, order = [['id', 'DESC']], transaction } = {}) {
	return models.Resource.findAndCountAll({
		where,
		limit,
		offset,
		order,
		include: standardIncludes,
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
	getFileById,
	getModuleById,
	getThematicAreaById,
	listFacilityThematicAreaIds,
	// Re-exported learning repository helpers for testing stubbing and scope checks
	isModuleInFacilityScope: (...args) => learningRepository.isModuleInFacilityScope(...args),
	isThematicAreaInFacilityScope: (...args) => learningRepository.isThematicAreaInFacilityScope(...args),
	listModuleIdsForFacility: (...args) => learningRepository.listModuleIdsForFacility(...args),
	listMentorModuleIds: (...args) => learningRepository.listMentorModuleIds(...args),
	hasActiveMentorAssignment: (...args) => learningRepository.hasActiveMentorAssignment(...args),
	hasModuleMentorPermission: (...args) => learningRepository.hasModuleMentorPermission(...args),
	getModuleProgress: (...args) => learningRepository.getModuleProgress(...args),
};
