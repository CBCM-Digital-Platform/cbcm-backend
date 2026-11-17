const { News } = require('../models');

async function findAndCountAll(options = {}) {
	return News.findAndCountAll(options);
}

async function findById(id) {
	return News.findByPk(id);
}

async function findBySlug(slug) {
	return News.findOne({ where: { slug } });
}

async function findPublicById(id, now) {
	const { Op } = require('sequelize');
	return News.findOne({
		where: { id, status: 'published', published_at: { [Op.lte]: now } },
	});
}

async function findPublicBySlug(slug, now) {
	const { Op } = require('sequelize');
	return News.findOne({
		where: { slug, status: 'published', published_at: { [Op.lte]: now } },
	});
}

async function create(values, options = {}) {
	return News.create(values, options);
}

async function update(id, values, options = {}) {
	const [count] = await News.update(values, { where: { id }, ...options });
	if (!count) return null;
	return findById(id);
}

async function destroy(id, options = {}) {
	return (await News.destroy({ where: { id }, ...options })) > 0;
}

module.exports = {
	findAndCountAll,
	findById,
	findBySlug,
	findPublicById,
	findPublicBySlug,
	create,
	update,
	destroy,
};
