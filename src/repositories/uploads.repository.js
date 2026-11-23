const { Op } = require('sequelize');
const { UploadedFile, LearningModuleContent, Resource } = require('../models');

async function create(data) {
	return UploadedFile.create(data);
}

async function findById(id) {
	return UploadedFile.findByPk(id);
}

async function destroy(id) {
	const count = await UploadedFile.destroy({ where: { id } });
	return count > 0;
}

async function countClassifiedLearningMaterialReferences(id) {
	const [contentReferences, resourceReferences] = await Promise.all([
		LearningModuleContent.count({
			where: {
				file_id: id,
				category: { [Op.ne]: null },
			},
		}),
		Resource.count({
			where: { file_id: id },
		}),
	]);
	return contentReferences + resourceReferences;
}

module.exports = {
	create,
	findById,
	destroy,
	countClassifiedLearningMaterialReferences,
};
