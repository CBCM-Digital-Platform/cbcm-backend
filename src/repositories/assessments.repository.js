// src/repositories/assessments.repository.js
const { Assessment, AssessmentCriteriaScore, AssessmentChecklistItem, AssessmentEvidence, User, Facility, MentorshipCycle, ThematicArea } = require('../models');

async function findAll(options = {}) {
	return Assessment.findAll(options);
}

async function findById(id, options = {}) {
	return Assessment.findByPk(id, options);
}

async function findOne(where, options = {}) {
	return Assessment.findOne({ where, ...options });
}

async function findMany(where, options = {}) {
	return Assessment.findAll({ where, ...options });
}

async function create(data, options = {}) {
	return Assessment.create(data, options);
}

async function update(id, data, options = {}) {
	const [count] = await Assessment.update(data, { where: { id }, ...options });
	if (count === 0) return null;
	return findById(id, options);
}

async function destroy(id, options = {}) {
	const count = await Assessment.destroy({ where: { id }, ...options });
	return count > 0;
}

async function count(where = {}) {
	return Assessment.count({ where });
}

async function findWithIncludes(id) {
	return Assessment.findByPk(id, {
		include: [
			{ model: User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: User, as: 'updatedBy', attributes: ['id', 'full_name', 'email'], required: false },
			{ model: Facility, as: 'facility', attributes: ['id', 'name', 'type', 'level'], required: false },
			{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name', 'status', 'start_date', 'end_date'], required: false },
			{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'], required: false },
			{ model: AssessmentCriteriaScore, as: 'criteriaScores', required: false },
			{ model: AssessmentChecklistItem, as: 'checklistItems', required: false },
			{ model: AssessmentEvidence, as: 'evidence', required: false },
		],
	});
}

async function findManyWithIncludes(where, options = {}) {
	return Assessment.findAndCountAll({
		where,
		include: [
			{ model: User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email', 'role', 'facility_id'], required: false },
			{ model: Facility, as: 'facility', attributes: ['id', 'name', 'type', 'level'], required: false },
			{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name', 'status', 'start_date', 'end_date'], required: false },
			{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'], required: false },
		],
		...options,
	});
}

async function findByMentee(menteeId, options = {}) {
	return findMany({ mentee_id: menteeId }, options);
}

async function findByMentor(mentorId, options = {}) {
	return findMany({ mentor_id: mentorId }, options);
}

async function findByFacility(facilityId, options = {}) {
	return findMany({ facility_id: facilityId }, options);
}

async function findByCycle(cycleId, options = {}) {
	return findMany({ cycle_id: cycleId }, options);
}

async function findByThematicArea(thematicAreaId, options = {}) {
	return findMany({ thematic_area_id: thematicAreaId }, options);
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
	findByMentee,
	findByMentor,
	findByFacility,
	findByCycle,
	findByThematicArea,
};
