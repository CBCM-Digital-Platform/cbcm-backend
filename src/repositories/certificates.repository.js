const { sequelize } = require('../models');
const { Op } = require('sequelize');

async function create(payload) {
	const { Certificate } = require('../models');
	return Certificate.create(payload);
}

async function findById(id) {
	const { Certificate } = require('../models');
	return Certificate.findByPk(id, {
		include: [
			{ model: require('../models').User, as: 'mentee', attributes: ['id', 'full_name', 'email'] },
			{ model: require('../models').MentorshipCycle, as: 'cycle', attributes: ['id', 'name'] },
			{ model: require('../models').ThematicArea, as: 'thematicArea', attributes: ['id', 'name'] },
			{ model: require('../models').CertificateTemplate, as: 'template', attributes: ['id', 'name'] },
			{ model: require('../models').User, as: 'issuedBy', attributes: ['id', 'full_name'] },
		],
	});
}

async function findMany(where = {}, options = {}) {
	const { Certificate } = require('../models');
	const { page = 1, limit = 20, order = [['issued_at', 'DESC']] } = options;
	const offset = (page - 1) * limit;

	const { count, rows } = await Certificate.findAndCountAll({
		where,
		include: [
			{ model: require('../models').User, as: 'mentee', attributes: ['id', 'full_name', 'email'] },
			{ model: require('../models').MentorshipCycle, as: 'cycle', attributes: ['id', 'name'] },
			{ model: require('../models').ThematicArea, as: 'thematicArea', attributes: ['id', 'name'] },
			{ model: require('../models').CertificateTemplate, as: 'template', attributes: ['id', 'name'] },
			{ model: require('../models').User, as: 'issuedBy', attributes: ['id', 'full_name'] },
		],
		order,
		limit,
		offset,
	});

	return { count, rows };
}

async function update(id, payload) {
	const { Certificate } = require('../models');
	const [count] = await Certificate.update(payload, { where: { id } });
	return count > 0;
}

async function destroy(id) {
	const { Certificate } = require('../models');
	const count = await Certificate.destroy({ where: { id } });
	return count > 0;
}

async function findActiveCertificate(menteeId, cycleId, thematicAreaId) {
	const { Certificate } = require('../models');
	return Certificate.findOne({
		where: {
			mentee_id: menteeId,
			cycle_id: cycleId,
			thematic_area_id: thematicAreaId,
			status: 'issued',
		},
		order: [['version', 'DESC']],
	});
}

async function findEligibleAssessment(menteeId, cycleId, thematicAreaId) {
	const { Assessment } = require('../models');
	return Assessment.findOne({
		where: {
			mentee_id: menteeId,
			cycle_id: cycleId,
			thematic_area_id: thematicAreaId,
			status: 'finalized',
			practical_passed: true,
			theory_passed: true,
		},
		order: [['finalized_at', 'DESC']],
	});
}

module.exports = {
	create,
	findById,
	findMany,
	update,
	destroy,
	findActiveCertificate,
	findEligibleAssessment,
};
