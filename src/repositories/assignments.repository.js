// src/repositories/assignments.repository.js
const { Op } = require('sequelize');
const { Assignment, User, Facility, MentorshipCycle, ThematicArea } = require('../models');

async function findAll(options = {}) {
	return Assignment.findAll(options);
}

async function findById(id, options = {}) {
	return Assignment.findByPk(id, options);
}

async function findOne(where, options = {}) {
	return Assignment.findOne({ where, ...options });
}

async function findMany(where, options = {}) {
	return Assignment.findAll({ where, ...options });
}

async function create(data, options = {}) {
	return Assignment.create(data, options);
}

async function update(id, data, options = {}) {
	const [count] = await Assignment.update(data, { where: { id }, ...options });
	if (count === 0) return null;
	return findById(id, options);
}

async function destroy(id, options = {}) {
	const count = await Assignment.destroy({ where: { id }, ...options });
	return count > 0;
}

async function count(where = {}) {
	return Assignment.count({ where });
}

async function findWithIncludes(id) {
	return Assignment.findByPk(id, {
		include: [
			{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: Facility, as: 'facility', attributes: ['id', 'name', 'type', 'level'], required: false },
			{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name', 'status', 'start_date', 'end_date'], required: false },
			{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'], required: false },
		],
	});
}

async function findManyWithIncludes(where, options = {}) {
	return Assignment.findAndCountAll({
		where,
		include: [
			{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: Facility, as: 'facility', attributes: ['id', 'name', 'type', 'level'], required: false },
			{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name', 'status', 'start_date', 'end_date'], required: false },
			{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'], required: false },
		],
		...options,
	});
}

async function findByMenteeId(menteeId, options = {}) {
	return Assignment.findAll({
		where: { mentee_id: menteeId },
		include: [
			{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: Facility, as: 'facility', attributes: ['id', 'name', 'type', 'level'], required: false },
			{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name', 'status', 'start_date', 'end_date'], required: false },
			{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'], required: false },
		],
		...options,
	});
}

async function findByMentorId(mentorId, options = {}) {
	return Assignment.findAll({
		where: { mentor_id: mentorId },
		include: [
			{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: Facility, as: 'facility', attributes: ['id', 'name', 'type', 'level'], required: false },
			{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name', 'status', 'start_date', 'end_date'], required: false },
			{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'], required: false },
		],
		...options,
	});
}

async function findActiveAssignment(mentorId, menteeId, cycleId) {
	return findOne({
		mentor_id: mentorId,
		mentee_id: menteeId,
		cycle_id: cycleId,
		status: { [Op.ne]: 'cancelled' },
		unassigned_at: null,
	});
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
	findWithIncludes,
	findManyWithIncludes,
	findByMenteeId,
	findByMentorId,
	findActiveAssignment,
};
