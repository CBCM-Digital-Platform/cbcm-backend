// src/repositories/sessions.repository.js
const { Op } = require('sequelize');
const { ClinicalEncounter, Assignment, User, Facility, MentorshipCycle, ThematicArea, MentorNote } = require('../models');

async function findAll(options = {}) {
	return ClinicalEncounter.findAll(options);
}

async function findById(id, options = {}) {
	return ClinicalEncounter.findByPk(id, options);
}

async function findOne(where, options = {}) {
	return ClinicalEncounter.findOne({ where, ...options });
}

async function findMany(where, options = {}) {
	return ClinicalEncounter.findAll({ where, ...options });
}

async function create(data, options = {}) {
	return ClinicalEncounter.create(data, options);
}

async function update(id, data, options = {}) {
	const [count] = await ClinicalEncounter.update(data, { where: { id }, ...options });
	if (count === 0) return null;
	return findById(id, options);
}

async function destroy(id, options = {}) {
	const count = await ClinicalEncounter.destroy({ where: { id }, ...options });
	return count > 0;
}

async function count(where = {}) {
	return ClinicalEncounter.count({ where });
}

async function findWithIncludes(id) {
	return ClinicalEncounter.findByPk(id, {
		include: [
			{ model: Assignment, as: 'assignment', include: [
				{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email', 'role'] },
				{ model: User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'role'] },
				{ model: Facility, as: 'facility', attributes: ['id', 'name', 'type', 'level'] },
				{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name', 'status'] },
				{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'] },
			]},
			{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email', 'role'] },
			{ model: User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'role'] },
			{ model: Facility, as: 'facility', attributes: ['id', 'name', 'type', 'level'] },
		],
	});
}

async function findManyWithIncludes(where, options = {}) {
	return ClinicalEncounter.findAll({
		where,
		include: [
			{ model: Assignment, as: 'assignment', include: [
				{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email', 'role'] },
				{ model: User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'role'] },
				{ model: Facility, as: 'facility', attributes: ['id', 'name', 'type', 'level'] },
				{ model: MentorshipCycle, as: 'cycle', attributes: ['id', 'name', 'status'] },
				{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'] },
			]},
			{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email', 'role'] },
			{ model: User, as: 'mentee', attributes: ['id', 'full_name', 'email', 'role'] },
			{ model: Facility, as: 'facility', attributes: ['id', 'name', 'type', 'level'] },
		],
		...options,
	});
}

async function findByMentorId(mentorId, options = {}) {
	return findManyWithIncludes({ mentor_id: mentorId }, options);
}

async function findByMenteeId(menteeId, options = {}) {
	return findManyWithIncludes({ mentee_id: menteeId }, options);
}

async function findByAssignmentId(assignmentId, options = {}) {
	return findManyWithIncludes({ assignment_id: assignmentId }, options);
}

async function checkForConflicts(mentorId, menteeId, scheduledAt, durationMinutes, excludeSessionId = null) {
	const scheduledStart = new Date(scheduledAt);
	const scheduledEnd = new Date(scheduledStart.getTime() + durationMinutes * 60000);

	const where = {
		status: { [Op.in]: ['scheduled', 'in_progress'] },
		[Op.or]: [
			{ mentor_id: mentorId },
			{ mentee_id: menteeId },
		],
		scheduled_at: {
			[Op.lt]: scheduledEnd,
		},
	};

	if (excludeSessionId) {
		where.id = { [Op.ne]: excludeSessionId };
	}

	const conflictingSessions = await ClinicalEncounter.findAll({
		where,
		attributes: ['id', 'scheduled_at', 'duration_minutes', 'status'],
	});

	const actualConflicts = conflictingSessions.filter((session) => {
		const sessionStart = new Date(session.scheduled_at);
		const sessionEnd = session.duration_minutes
			? new Date(sessionStart.getTime() + session.duration_minutes * 60000)
			: new Date(sessionStart.getTime() + 60 * 60000); // Default 1 hour if no duration

		return scheduledStart < sessionEnd && scheduledEnd > sessionStart;
	});

	return actualConflicts;
}

async function assignJitsiRoom(encounterId) {
	if (!encounterId) return null;
	const crypto = require('crypto');
	const roomId = crypto.randomBytes(16).toString('hex');
	const [count] = await ClinicalEncounter.update(
		{ jitsi_room_id: roomId, jitsi_room_enabled: true },
		{ where: { id: encounterId } }
	);
	if (count === 0) return null;
	return roomId;
}

async function createMentorNote(encounterId, mentorId, note, options = {}) {
	return MentorNote.create({
		encounter_id: encounterId,
		mentor_id: mentorId,
		note,
	}, options);
}

async function getMentorNotes(encounterId, options = {}) {
	return MentorNote.findAll({
		where: { encounter_id: encounterId },
		include: [
			{ model: User, as: 'mentor', attributes: ['id', 'full_name', 'email'] },
		],
		order: [['created_at', 'ASC']],
		...options,
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
	findByMentorId,
	findByMenteeId,
	findByAssignmentId,
	checkForConflicts,
	assignJitsiRoom,
	createMentorNote,
	getMentorNotes,
};
