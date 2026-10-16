// src/services/matching.service.js
const { Assignment, User, KnowledgeScoreSnapshot, CycleFacility, sequelize } = require('../models');
const AppError = require('../errors/app-error');
const { canAccessFacility } = require('../constants/roles.constants');

async function findMentorMatches(criteria, actor) {
	const { cycle_id, facility_id, mentee_id, thematic_area_id } = criteria;

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin') {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		if (facility_id && facility_id !== actor.facility_id) {
			throw new AppError('You can only match within your authorized facility.', 403, 'FORBIDDEN');
		}
	}

	// Get available mentors at the facility
	const mentors = await User.findAll({
		where: {
			role: 'mentor',
			status: 'active',
			facility_id: facility_id,
		},
		attributes: ['id', 'full_name', 'email', 'facility_id'],
	});

	// If a specific mentee is provided, get their latest knowledge scores
	let menteeCompetencies = {};
	if (mentee_id) {
		const mentee = await User.findByPk(mentee_id);
		if (!mentee) throw new AppError('Mentee was not found.', 404, 'MENTEE_NOT_FOUND');
		if (mentee.role !== 'mentee') throw new AppError('Selected user is not a mentee.', 400, 'INVALID_ROLE');

		const snapshots = await KnowledgeScoreSnapshot.findAll({
			where: { mentee_id, cycle_id },
			order: [['recorded_at', 'DESC']],
		});

		snapshots.forEach((s) => {
			if (!menteeCompetencies[s.thematic_area_id] || new Date(s.recorded_at) > new Date(menteeCompetencies[s.thematic_area_id].recorded_at)) {
				menteeCompetencies[s.thematic_area_id] = s;
			}
		});
	}

	// Generate match suggestions based on availability
	const matches = mentors.map((mentor) => {
		const match = {
			mentor_id: mentor.id,
			mentor_name: mentor.full_name,
			facility_id: mentor.facility_id,
			cycle_id,
			thematic_area_id,
			compatibility_score: null,
			reason: 'Available mentor in facility',
		};

		// If we have competency data, calculate a simple compatibility score
		if (thematic_area_id && menteeCompetencies[thematic_area_id]) {
			const menteeScore = menteeCompetencies[thematic_area_id].score || 0;
			// Simple baseline compatibility: higher for mentees with lower scores (need more help)
			match.compatibility_score = Math.max(0, 100 - menteeScore);
			match.reason = `Mentee competency score: ${menteeScore}, recommended for mentoring support`;
		}

		return match;
	});

	return {
		criteria,
		total_matches: matches.length,
		matches,
	};
}

module.exports = {
	findMentorMatches,
};
