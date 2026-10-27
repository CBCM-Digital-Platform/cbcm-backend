const { sequelize } = require('../models');
const { Op } = require('sequelize');

async function create(payload) {
	const { LogbookEntry } = require('../models');
	return LogbookEntry.create(payload);
}

async function findById(id) {
	const { LogbookEntry } = require('../models');
	return LogbookEntry.findByPk(id, {
		include: [
			{ model: require('../models').User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'facility_id'] },
			{ model: require('../models').ClinicalEncounter, as: 'encounter', attributes: ['id', 'clinical_setting', 'facility_id'] },
			{ model: require('../models').ThematicArea, as: 'thematicArea', attributes: ['id', 'name'] },
			{ model: require('../models').User, as: 'createdBy', attributes: ['id', 'full_name'] },
			{ model: require('../models').User, as: 'approvedBy', attributes: ['id', 'full_name'] },
		],
	});
}

async function findMany(where = {}, options = {}) {
	const { LogbookEntry } = require('../models');
	const { page = 1, limit = 20, order = [['logged_at', 'DESC']] } = options;
	const offset = (page - 1) * limit;

	const { count, rows } = await LogbookEntry.findAndCountAll({
		where,
		include: [
			{ model: require('../models').User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'facility_id'] },
			{ model: require('../models').ClinicalEncounter, as: 'encounter', attributes: ['id', 'clinical_setting', 'facility_id'] },
			{ model: require('../models').ThematicArea, as: 'thematicArea', attributes: ['id', 'name'] },
			{ model: require('../models').User, as: 'createdBy', attributes: ['id', 'full_name'] },
			{ model: require('../models').User, as: 'approvedBy', attributes: ['id', 'full_name'] },
		],
		order,
		limit,
		offset,
	});

	return { count, rows };
}

async function update(id, payload) {
	const { LogbookEntry } = require('../models');
	const [count] = await LogbookEntry.update(payload, { where: { id } });
	return count > 0;
}

async function destroy(id) {
	const { LogbookEntry } = require('../models');
	const count = await LogbookEntry.destroy({ where: { id } });
	return count > 0;
}

async function findByMenteeAndEncounter(menteeId, encounterId) {
	const { LogbookEntry } = require('../models');
	return LogbookEntry.findOne({
		where: { mentee_id: menteeId, encounter_id },
	});
}

async function countByMenteeAndStatus(menteeId, status) {
	const { LogbookEntry } = require('../models');
	return LogbookEntry.count({
		where: { mentee_id: menteeId, status },
	});
}

async function getTotalHoursByMentee(menteeId) {
	const { LogbookEntry } = require('../models');
	const result = await LogbookEntry.findOne({
		attributes: [
			[sequelize.fn('SUM', sequelize.col('hours')), 'total_hours'],
		],
		where: {
			mentee_id: menteeId,
			status: 'approved',
		},
		raw: true,
	});
	return result ? result.total_hours || 0 : 0;
}

module.exports = {
	create,
	findById,
	findMany,
	update,
	destroy,
	findByMenteeAndEncounter,
	countByMenteeAndStatus,
	getTotalHoursByMentee,
};
