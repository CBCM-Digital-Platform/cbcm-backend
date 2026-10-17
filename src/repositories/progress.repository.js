// src/repositories/progress.repository.js
const { KnowledgeScoreSnapshot } = require('../models');

async function findAll(options = {}) {
	return KnowledgeScoreSnapshot.findAll(options);
}

async function findById(id, options = {}) {
	return KnowledgeScoreSnapshot.findByPk(id, options);
}

async function findOne(where, options = {}) {
	return KnowledgeScoreSnapshot.findOne({ where, ...options });
}

async function findMany(where, options = {}) {
	return KnowledgeScoreSnapshot.findAll({ where, ...options });
}

async function create(data, options = {}) {
	return KnowledgeScoreSnapshot.create(data, options);
}

async function update(id, data, options = {}) {
	const [count] = await KnowledgeScoreSnapshot.update(data, { where: { id }, ...options });
	if (count === 0) return null;
	return findById(id, options);
}

async function destroy(id, options = {}) {
	const count = await KnowledgeScoreSnapshot.destroy({ where: { id }, ...options });
	return count > 0;
}

async function count(where = {}) {
	return KnowledgeScoreSnapshot.count({ where });
}

async function findByMentee(menteeId, options = {}) {
	return findMany({ mentee_id: menteeId }, options);
}

async function findByCycle(cycleId, options = {}) {
	return findMany({ cycle_id: cycleId }, options);
}

async function findByFacility(facilityId, options = {}) {
	return findMany({ facility_id: facilityId }, options);
}

async function findByThematicArea(thematicAreaId, options = {}) {
	return findMany({ thematic_area_id: thematicAreaId }, options);
}

async function findLatestByMentee(menteeId, options = {}) {
	return findOne({ mentee_id: menteeId }, { order: [['recorded_at', 'DESC']], ...options });
}

async function findMenteeProgressHistory(menteeId, options = {}) {
	return findMany({ mentee_id: menteeId }, { order: [['recorded_at', 'ASC']], ...options });
}

module.exports = {
	findAll,
	findById,
	findOne,
	findMany,
	create,
	update,
	destroy,
	count,
	findByMentee,
	findByCycle,
	findByFacility,
	findByThematicArea,
	findLatestByMentee,
	findMenteeProgressHistory,
};
