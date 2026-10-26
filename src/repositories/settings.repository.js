const { FAQ, UserGuide, UploadedFile } = require('../models');

function listFaqs({ where, limit, offset }) {
	return FAQ.findAndCountAll({
		where,
		order: [['category', 'ASC'], ['id', 'ASC']],
		limit,
		offset,
	});
}

function findFaqById(id) {
	return FAQ.findByPk(id);
}

function createFaq(values, transaction) {
	return FAQ.create(values, { transaction });
}

async function updateFaq(faq, values, transaction) {
	await faq.update(values, { transaction });
	return faq;
}

async function deleteFaq(faq, transaction) {
	await faq.destroy({ transaction });
}

function listGuides({ where, limit, offset }) {
	return UserGuide.findAndCountAll({
		where,
		order: [['title', 'ASC'], ['id', 'ASC']],
		limit,
		offset,
	});
}

function findGuideById(id) {
	return UserGuide.findByPk(id);
}

function createGuide(values, transaction) {
	return UserGuide.create(values, { transaction });
}

async function updateGuide(guide, values, transaction) {
	await guide.update(values, { transaction });
	return guide;
}

async function deleteGuide(guide, transaction) {
	await guide.destroy({ transaction });
}

function getUploadedFile(id) {
	return UploadedFile.findByPk(id);
}

module.exports = {
	getUploadedFile,
	listFaqs,
	findFaqById,
	createFaq,
	updateFaq,
	deleteFaq,
	listGuides,
	findGuideById,
	createGuide,
	updateGuide,
	deleteGuide,
};
