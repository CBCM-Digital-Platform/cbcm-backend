const { PracticalChecklist, PracticalChecklistItem, ThematicArea, UploadedFile } = require('../models');
const { Op } = require('sequelize');

async function findById(id, options = {}) {
	return PracticalChecklist.findByPk(id, options);
}

async function findMany(where = {}, options = {}) {
	return PracticalChecklist.findAll({ where, ...options });
}

async function create(data, options = {}) {
	return PracticalChecklist.create(data, options);
}

async function update(id, data, options = {}) {
	const [count] = await PracticalChecklist.update(data, { where: { id }, ...options });
	if (count === 0) return null;
	return findById(id, options);
}

async function nextVersion(thematicAreaId, procedure) {
	const max = await PracticalChecklist.max('version', {
		where: { thematic_area_id: thematicAreaId, procedure },
	});
	return (max || 0) + 1;
}

async function replaceItems(checklistId, items, options = {}) {
	await PracticalChecklistItem.destroy({ where: { checklist_id: checklistId }, ...options });
	const records = (items || []).map((item, index) => ({
		checklist_id: checklistId,
		item_text: item.item_text || item.text || item.item,
		sort_order: item.sort_order ?? index,
		is_required: Boolean(item.is_required),
		is_critical: Boolean(item.is_critical),
	}));
	if (records.length === 0) return [];
	return PracticalChecklistItem.bulkCreate(records, options);
}

async function listItems(checklistId, options = {}) {
	return PracticalChecklistItem.findAll({
		where: { checklist_id: checklistId },
		order: [['sort_order', 'ASC'], ['id', 'ASC']],
		...options,
	});
}

async function findPublishedForArea(thematicAreaId, { procedure } = {}) {
	const where = { thematic_area_id: thematicAreaId, status: 'published' };
	if (procedure) {
		where[Op.or] = [
			{ procedure: { [Op.iLike]: `%${procedure}%` } },
			{ title: { [Op.iLike]: `%${procedure}%` } },
		];
	}
	return PracticalChecklist.findAll({
		where,
		include: [{ model: PracticalChecklistItem, as: 'items' }],
		order: [['procedure', 'ASC'], ['version', 'DESC']],
	});
}

module.exports = {
	findById,
	findMany,
	create,
	update,
	nextVersion,
	replaceItems,
	listItems,
	findPublishedForArea,
};
