// src/services/assessments.service.js
const { sequelize, Assessment, AssessmentCriteriaScore, AssessmentChecklistItem, AssessmentEvidence, User, Facility, MentorshipCycle, ThematicArea, Assignment } = require('../models');
const AppError = require('../errors/app-error');
const { canAccessFacility, canAccessUser, SYSTEM_ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../constants/roles.constants');
const AssessmentStatus = require('../enums/assessment-status.enum');
const CycleStatus = require('../enums/cycle-status.enum');
const AssignmentStatus = require('../enums/assignment-status.enum');
const repository = require('../repositories/assessments.repository');
const assignmentsRepository = require('../repositories/assignments.repository');
const Role = require('../enums/role.enum');

const ASSESSMENT_FIELDS = ['mentee_id', 'mentor_id', 'facility_id', 'cycle_id', 'thematic_area_id', 'status', 'aggregate_score', 'feedback', 'prerequisites_met', 'finalized_at'];

function toAssessmentResponse(assessment) {
	if (!assessment) return null;
	const value = assessment.toJSON ? assessment.toJSON() : assessment;
	return Object.fromEntries(
		['id', ...ASSESSMENT_FIELDS, 'created_at', 'updated_at']
			.filter((field) => value[field] !== undefined)
			.map((field) => [field, value[field]])
	);
}

function toAssessmentDetailResponse(assessment) {
	if (!assessment) return null;
	const value = assessment.toJSON ? assessment.toJSON() : assessment;
	const response = toAssessmentResponse(assessment);
	
	if (value.criteriaScores) {
		response.criteria_scores = value.criteriaScores.map((cs) => ({
			id: cs.id,
			criterion: cs.criterion,
			score: cs.score,
		}));
	}
	
	if (value.checklistItems) {
		response.checklist_items = value.checklistItems.map((ci) => ({
			id: ci.id,
			item: ci.item,
			checked: ci.checked,
		}));
	}
	
	if (value.evidence) {
		response.evidence = value.evidence.map((ev) => ({
			id: ev.id,
			title: ev.title,
			file_id: ev.file_id,
			uploaded_by: ev.uploaded_by,
			uploaded_at: ev.uploaded_at,
		}));
	}
	
	return response;
}

function buildPagination(page = 1, limit = 20) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

async function listAssessments({ page = 1, limit = 20, mentee_id, mentor_id, facility_id, cycle_id, thematic_area_id, status }, actor) {
	const where = {};

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === Role.FACILITY_ADMIN) {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		where.facility_id = actor.facility_id;
	} else if (facility_id) {
		// System Admin can filter by facility if specified
		where.facility_id = facility_id;
	}

	// Mentors can only see assessments for their mentees
	if (actor && actor.role === Role.MENTOR) {
		where.mentor_id = actor.id;
	} else if (mentor_id) {
		where.mentor_id = mentor_id;
	}

	// Mentees can only see their own assessments
	if (actor && actor.role === Role.MENTEE) {
		where.mentee_id = actor.id;
	} else if (mentee_id) {
		where.mentee_id = mentee_id;
	}

	if (cycle_id) where.cycle_id = cycle_id;
	if (thematic_area_id) where.thematic_area_id = thematic_area_id;
	if (status) where.status = status;

	const pagination = buildPagination(page, limit);
	const { count, rows } = await repository.findManyWithIncludes(where, {
		order: [['id', 'DESC']],
		limit: pagination.limit,
		offset: pagination.offset,
	});

	return {
		items: rows.map(toAssessmentResponse),
		total: count,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil(count / pagination.limit)),
	};
}

async function getAssessment(id, actor) {
	const assessment = await repository.findWithIncludes(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization check
	if (actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only view assessments for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE && assessment.mentee_id !== actor.id) {
		throw new AppError('You can only view your own assessments.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
		throw new AppError('You can only view assessments at your facility.', 403, 'FORBIDDEN');
	}

	return toAssessmentDetailResponse(assessment);
}

async function createAssessment(payload, actor) {
	const { mentee_id, mentor_id, facility_id, cycle_id, thematic_area_id, prerequisites_met = false } = payload;

	// Validate mentee
	const mentee = await User.findByPk(mentee_id);
	if (!mentee) throw new AppError('Mentee was not found.', 404, 'MENTEE_NOT_FOUND');
	if (mentee.role !== 'mentee') throw new AppError('Selected user is not a mentee.', 400, 'INVALID_ROLE');

	// Validate mentor
	const mentor = await User.findByPk(mentor_id);
	if (!mentor) throw new AppError('Mentor was not found.', 404, 'MENTOR_NOT_FOUND');
	if (mentor.role !== 'mentor') throw new AppError('Selected user is not a mentor.', 400, 'INVALID_ROLE');

	// Validate facility
	const facility = await Facility.findByPk(facility_id);
	if (!facility) throw new AppError('Facility was not found.', 404, 'FACILITY_NOT_FOUND');

	// Validate cycle
	const cycle = await MentorshipCycle.findByPk(cycle_id);
	if (!cycle) throw new AppError('Mentorship cycle was not found.', 404, 'CYCLE_NOT_FOUND');
	if (cycle.status !== CycleStatus.ACTIVE) {
		throw new AppError('Assessments can only be created during active cycles.', 400, 'INVALID_CYCLE_STATUS');
	}

	// Validate thematic area if provided
	if (thematic_area_id) {
		const thematicArea = await ThematicArea.findByPk(thematic_area_id);
		if (!thematicArea) throw new AppError('Thematic area was not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
	}

	// Verify active assignment exists
	const assignment = await Assignment.findOne({
		where: {
			mentee_id,
			mentor_id,
			facility_id,
			cycle_id,
			...(thematic_area_id ? { thematic_area_id } : {}),
			status: AssignmentStatus.ASSIGNED,
		},
	});
	if (!assignment) {
		throw new AppError('No active assignment found for this mentor-mentee pair in the specified cycle.', 400, 'NO_ACTIVE_ASSIGNMENT');
	}

	// Enforce RBAC scope
	if (actor.role === Role.FACILITY_ADMIN) {
		if (!canAccessFacility(actor, facility_id)) {
			throw new AppError('You can only create assessments within your authorized facility.', 403, 'FORBIDDEN');
		}
	}

	// Mentors can only create assessments for their assigned mentees
	if (actor.role === Role.MENTOR && mentor_id !== actor.id) {
		throw new AppError('You can only create assessments for your mentees.', 403, 'FORBIDDEN');
	}

	const assessment = await Assessment.create({
		mentee_id,
		mentor_id,
		facility_id,
		cycle_id,
		thematic_area_id,
		status: AssessmentStatus.DRAFT,
		prerequisites_met,
		updated_by: actor.id,
	});

	return toAssessmentResponse(assessment);
}

async function updateAssessment(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization check
	if (actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only update assessments for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE) {
		throw new AppError('Mentees cannot update assessments.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
		throw new AppError('You can only update assessments at your facility.', 403, 'FORBIDDEN');
	}

	// Only draft assessments can be edited
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be updated.', 400, 'INVALID_STATUS_TRANSITION');
	}

	const { feedback, prerequisites_met } = payload;
	const updateData = {};
	if (feedback !== undefined) updateData.feedback = feedback;
	if (prerequisites_met !== undefined) updateData.prerequisites_met = prerequisites_met;
	updateData.updated_by = actor.id;

	const updated = await repository.update(id, updateData);
	return toAssessmentResponse(updated);
}

async function finalizeAssessment(id, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization check
	if (actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only finalize assessments for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE) {
		throw new AppError('Mentees cannot finalize assessments.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
		throw new AppError('You can only finalize assessments at your facility.', 403, 'FORBIDDEN');
	}

	// Validate status transition
	if (!AssessmentStatus.isValidTransition(assessment.status, AssessmentStatus.FINALIZED)) {
		throw new AppError(`Cannot transition from ${assessment.status} to finalized.`, 400, 'INVALID_STATUS_TRANSITION');
	}

	// Validate completeness - must have at least one criteria score
	const criteriaScores = await AssessmentCriteriaScore.findAll({ where: { assessment_id: id } });
	if (criteriaScores.length === 0) {
		throw new AppError('Assessment must have at least one criteria score before finalization.', 400, 'INCOMPLETE_ASSESSMENT');
	}

	// Check for missing scores (null/undefined)
	const hasMissingScores = criteriaScores.some((cs) => cs.score === null || cs.score === undefined);
	if (hasMissingScores) {
		throw new AppError('All criteria scores must be provided before finalization.', 400, 'MISSING_SCORES');
	}

	// Validate prerequisites if required
	if (!assessment.prerequisites_met) {
		throw new AppError('Prerequisites must be met before finalization.', 400, 'PREREQUISITES_NOT_MET');
	}

	// Calculate aggregate score (simple average of criteria scores)
	const totalScore = criteriaScores.reduce((sum, cs) => sum + cs.score, 0);
	const aggregateScore = totalScore / criteriaScores.length;

	await sequelize.transaction(async (transaction) => {
		await Assessment.update(
			{
				status: AssessmentStatus.FINALIZED,
				aggregate_score: aggregateScore,
				finalized_at: new Date(),
				updated_by: actor.id,
			},
			{ where: { id }, transaction }
		);
	});

	const updated = await repository.findById(id);
	return toAssessmentResponse(updated);
}

async function reviewAssessment(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization check - only facility admins and system admins can review
	if (!SYSTEM_ADMIN_ROLES.includes(actor.role) && !FACILITY_ADMIN_ROLES.includes(actor.role)) {
		throw new AppError('Only administrators can review assessments.', 403, 'FORBIDDEN');
	}

	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
		throw new AppError('You can only review assessments at your facility.', 403, 'FORBIDDEN');
	}

	// Validate status transition
	if (!AssessmentStatus.isValidTransition(assessment.status, AssessmentStatus.REVIEWED)) {
		throw new AppError(`Cannot transition from ${assessment.status} to reviewed.`, 400, 'INVALID_STATUS_TRANSITION');
	}

	// Review can update feedback and optionally adjust aggregate_score
	const { feedback, aggregate_score } = payload;
	const updateData = {
		status: AssessmentStatus.REVIEWED,
		updated_by: actor.id,
	};
	if (feedback !== undefined) updateData.feedback = feedback;
	if (aggregate_score !== undefined) updateData.aggregate_score = aggregate_score;

	const updated = await repository.update(id, updateData);
	return toAssessmentResponse(updated);
}

async function setCriteriaScore(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization check
	if (actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only score assessments for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE) {
		throw new AppError('Mentees cannot score assessments.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
		throw new AppError('You can only score assessments at your facility.', 403, 'FORBIDDEN');
	}

	// Only draft or in-review assessments can be scored
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be scored.', 400, 'INVALID_STATUS');
	}

	const { criteria_scores } = payload;
	if (!Array.isArray(criteria_scores) || criteria_scores.length === 0) {
		throw new AppError('criteria_scores must be a non-empty array.', 400, 'INVALID_CRITERIA_SCORES');
	}

	// Validate score values
	for (const cs of criteria_scores) {
		if (cs.score !== null && cs.score !== undefined) {
			if (typeof cs.score !== 'number' || cs.score < 0 || cs.score > 100) {
				throw new AppError('Scores must be numbers between 0 and 100.', 400, 'INVALID_SCORE_VALUE');
			}
		}
		if (!cs.criterion || typeof cs.criterion !== 'string' || cs.criterion.trim().length === 0) {
			throw new AppError('Each criterion must have a non-empty string value.', 400, 'INVALID_CRITERION');
		}
	}

	await sequelize.transaction(async (transaction) => {
		// Delete existing criteria scores for this assessment
		await AssessmentCriteriaScore.destroy({ where: { assessment_id: id }, transaction });

		// Create new criteria scores
		for (const cs of criteria_scores) {
			await AssessmentCriteriaScore.create(
				{
					assessment_id: id,
					criterion: cs.criterion.trim(),
					score: cs.score,
				},
				{ transaction }
			);
		}

		// Update assessment status to in_review if criteria are provided
		if (assessment.status === AssessmentStatus.DRAFT) {
			await Assessment.update(
				{ status: AssessmentStatus.IN_REVIEW, updated_by: actor.id },
				{ where: { id }, transaction }
			);
		}
	});

	const updated = await repository.findWithIncludes(id);
	return toAssessmentDetailResponse(updated);
}

async function setChecklistItems(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization check
	if (actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only update checklists for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE) {
		throw new AppError('Mentees cannot update assessment checklists.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
		throw new AppError('You can only update checklists at your facility.', 403, 'FORBIDDEN');
	}

	// Only draft or in-review assessments can be updated
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be updated.', 400, 'INVALID_STATUS');
	}

	const { checklist_items } = payload;
	if (!Array.isArray(checklist_items)) {
		throw new AppError('checklist_items must be an array.', 400, 'INVALID_CHECKLIST_ITEMS');
	}

	// Validate checklist items
	for (const item of checklist_items) {
		if (!item.item || typeof item.item !== 'string' || item.item.trim().length === 0) {
			throw new AppError('Each checklist item must have a non-empty string value.', 400, 'INVALID_CHECKLIST_ITEM');
		}
		if (typeof item.checked !== 'boolean') {
			throw new AppError('Each checklist item must have a boolean checked value.', 400, 'INVALID_CHECKED_VALUE');
		}
	}

	await sequelize.transaction(async (transaction) => {
		// Delete existing checklist items for this assessment
		await AssessmentChecklistItem.destroy({ where: { assessment_id: id }, transaction });

		// Create new checklist items
		for (const item of checklist_items) {
			await AssessmentChecklistItem.create(
				{
					assessment_id: id,
					item: item.item.trim(),
					checked: item.checked,
				},
				{ transaction }
			);
		}
	});

	const updated = await repository.findWithIncludes(id);
	return toAssessmentDetailResponse(updated);
}

async function addEvidence(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization check
	if (actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only add evidence for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE && assessment.mentee_id !== actor.id) {
		throw new AppError('You can only add evidence to your own assessments.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
		throw new AppError('You can only add evidence at your facility.', 403, 'FORBIDDEN');
	}

	// Only draft or in-review assessments can accept evidence
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can accept evidence.', 400, 'INVALID_STATUS');
	}

	const { title, file_id } = payload;
	if (!title || typeof title !== 'string' || title.trim().length === 0) {
		throw new AppError('Evidence must have a non-empty title.', 400, 'INVALID_EVIDENCE_TITLE');
	}
	if (!file_id || typeof file_id !== 'number') {
		throw new AppError('Evidence must have a valid file_id.', 400, 'INVALID_FILE_ID');
	}

	const evidence = await AssessmentEvidence.create({
		assessment_id: id,
		title: title.trim(),
		file_id,
		uploaded_by: actor.id,
		uploaded_at: new Date(),
	});

	return {
		id: evidence.id,
		assessment_id: evidence.assessment_id,
		title: evidence.title,
		file_id: evidence.file_id,
		uploaded_by: evidence.uploaded_by,
		uploaded_at: evidence.uploaded_at,
	};
}

module.exports = {
	listAssessments,
	getAssessment,
	createAssessment,
	updateAssessment,
	finalizeAssessment,
	reviewAssessment,
	setCriteriaScore,
	setChecklistItems,
	addEvidence,
};
