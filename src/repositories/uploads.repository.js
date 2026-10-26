const { UploadedFile } = require('../models');

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

module.exports = {
	create,
	findById,
	destroy,
};
