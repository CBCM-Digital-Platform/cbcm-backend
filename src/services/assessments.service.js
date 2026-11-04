// src/services/assessments.service.js
const { sequelize, Assessment, AssessmentCriteriaScore, AssessmentChecklistItem, AssessmentEvidence, User, Facility, MentorshipCycle, ThematicArea, Assignment } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/app-error');
const { canAccessFacility, canAccessUser, SYSTEM_ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../constants/roles.constants');
const AssessmentStatus = require('../enums/assessment-status.enum');
const CycleStatus = require('../enums/cycle-status.enum');
const AssignmentStatus = require('../enums/assignment-status.enum');
const repository = require('../repositories/assessments.repository');
const assignmentsRepository = require('../repositories/assignments.repository');
const progressService = require('./progress.service');
const Role = require('../enums/role.enum');
const { logActivity } = require('../utils/activity-logger.util');
const notificationService = require('./notifications.service');

const ASSESSMENT_FIELDS = ['mentee_id', 'mentor_id', 'facility_id', 'cycle_id', 'thematic_area_id', 'status', 'aggregate_score', 'feedback', 'prerequisites_met', 'practical_passed', 'practical_score', 'practical_assessed_by', 'practical_assessed_at', 'practical_feedback', 'theory_score', 'theory_passed', 'finalized_at'];

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
			score: ci.score,
			required: ci.required,
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

function calculatePracticalPass(checklistItems) {
	const requiredItems = checklistItems.filter((item) => item.required === true);
	
	// If no required items exist, cannot pass
	if (requiredItems.length === 0) {
		return false;
	}
	
	// Check if any required item is missing a score
	const hasMissingScores = requiredItems.some((item) => item.score === null || item.score === undefined);
	if (hasMissingScores) {
		return null; // Indicates missing scores, not a fail
	}
	
	// Check if any required item scored below 3
	const hasLowScore = requiredItems.some((item) => item.score < 3);
	return !hasLowScore;
}

function assertCanManageAssessmentResults(assessment, actor) {
	if (!actor) throw new AppError('You do not have permission to manage this assessment.', 403, 'FORBIDDEN');
	if (SYSTEM_ADMIN_ROLES.includes(actor.role)) return;
	if (actor.role === Role.MENTOR && Number(assessment.mentor_id) === Number(actor.id)) return;
	if (actor.role === Role.FACILITY_ADMIN && canAccessFacility(actor, assessment.facility_id)) return;
	throw new AppError('You do not have permission to manage this assessment.', 403, 'FORBIDDEN');
}

async function getMappedQuizAttempt(assessment, component) {
	if (assessment.thematic_area_id === null || assessment.thematic_area_id === undefined) {
		return { configured: false, reason: 'Assessment has no thematic area mapped.' };
	}

	const { LearningModule, Quiz, QuizAttempt } = require('../models');
	const modules = await LearningModule.findAll({
		where: {
			thematic_area_id: assessment.thematic_area_id,
			status: 'published',
			is_published: true,
			is_authorized: true,
		},
		attributes: ['id'],
	});
	const moduleIds = modules.map((module) => module.id);
	if (moduleIds.length === 0) {
		return { configured: false, reason: 'No published and authorized learning module found for thematic area.' };
	}

	const quizzes = await Quiz.findAll({
		where: {
			module_id: { [Op.in]: moduleIds },
			assessment_component: component,
			is_published: true,
			is_authorized: true,
		},
		order: [['id', 'ASC']],
	});
	if (quizzes.length === 0) {
		return { configured: false, reason: `No published and authorized ${component} quiz is mapped for this assessment.` };
	}
	if (quizzes.length > 1) {
		return {
			configured: true,
			ambiguous: true,
			reason: `Multiple ${component} quizzes are mapped for this assessment scope.`,
		};
	}

	const quiz = quizzes[0];
	const attemptNumberWhere = Number(quiz.attempt_limit) > 0
		? { [Op.between]: [1, Number(quiz.attempt_limit)] }
		: { [Op.gte]: 1 };
	const attempt = await QuizAttempt.findOne({
		where: {
			quiz_id: quiz.id,
			mentee_id: assessment.mentee_id,
			status: 'completed',
			completed_at: { [Op.ne]: null },
			attempt_number: attemptNumberWhere,
		},
		order: [['completed_at', 'DESC'], ['attempt_number', 'DESC'], ['id', 'DESC']],
	});

	if (!attempt
		|| Number(attempt.quiz_id) !== Number(quiz.id)
		|| Number(attempt.mentee_id) !== Number(assessment.mentee_id)
		|| attempt.status !== 'completed'
		|| !attempt.completed_at
		|| !Number.isInteger(Number(attempt.attempt_number))
		|| Number(attempt.attempt_number) < 1
		|| (Number(quiz.attempt_limit) > 0 && Number(attempt.attempt_number) > Number(quiz.attempt_limit))) {
		return { configured: true, quiz, reason: 'No valid completed quiz attempt found.' };
	}

	if (attempt.score === null || attempt.score === undefined || attempt.score === '') {
		return { configured: true, quiz, reason: 'Completed quiz attempt has an invalid score.' };
	}
	const score = Number(attempt.score);
	if (!Number.isFinite(score) || score < 0 || score > 100) {
		return { configured: true, quiz, reason: 'Completed quiz attempt has an invalid score.' };
	}
	return { configured: true, quiz, attempt, score };
}

async function hasMappedQuiz(assessment, component) {
	if (assessment.thematic_area_id === null || assessment.thematic_area_id === undefined) return false;
	const { LearningModule, Quiz } = require('../models');
	const modules = await LearningModule.findAll({
		where: { thematic_area_id: assessment.thematic_area_id },
		attributes: ['id'],
	});
	if (modules.length === 0) return false;
	return (await Quiz.count({
		where: {
			module_id: { [Op.in]: modules.map((module) => module.id) },
			assessment_component: component,
		},
	})) > 0;
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
	if (actor && actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only view assessments for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.MENTEE && assessment.mentee_id !== actor.id) {
		throw new AppError('You can only view your own assessments.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
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
	if (actor && actor.role === Role.FACILITY_ADMIN) {
		if (!canAccessFacility(actor, facility_id)) {
			throw new AppError('You can only create assessments within your authorized facility.', 403, 'FORBIDDEN');
		}
	}

	// Mentors can only create assessments for their assigned mentees
	if (actor && actor.role === Role.MENTOR && mentor_id !== actor.id) {
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
	if (actor && actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only update assessments for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.MENTEE) {
		throw new AppError('Mentees cannot update assessments.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
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
	if (actor && actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only finalize assessments for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.MENTEE) {
		throw new AppError('Mentees cannot finalize assessments.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
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

	// Validate checklist items for practical assessment
	const checklistItems = await AssessmentChecklistItem.findAll({ where: { assessment_id: id } });
	const requiredItems = checklistItems.filter((item) => item.required === true);
	
	// Validate that all required checklist items have scores
	if (requiredItems.length > 0) {
		const missingRequiredScores = requiredItems.some((item) => item.score === null || item.score === undefined);
		if (missingRequiredScores) {
			throw new AppError('All required checklist items must have a score before finalization.', 400, 'MISSING_REQUIRED_CHECKLIST_SCORES');
		}
	}

	// Validate prerequisites if required
	if (!assessment.prerequisites_met) {
		throw new AppError('Prerequisites must be met before finalization.', 400, 'PREREQUISITES_NOT_MET');
	}

	// Get active passing rule
	const passingRulesService = require('./assessment-passing-rules.service');
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	if (!passingRule) {
		throw new AppError('No active passing rule found. Please contact an administrator.', 500, 'NO_PASSING_RULE');
	}

	// Calculate aggregate score (simple average of criteria scores)
	const totalScore = criteriaScores.reduce((sum, cs) => sum + cs.score, 0);
	const aggregateScore = totalScore / criteriaScores.length;

	// Calculate criteria pass status
	const criteria_passed = aggregateScore >= passingRule.criteria_min_score;

	// Calculate practical pass status based on practical_score (1-5 scale) if available
	let practicalPassed = null;
	if (assessment.practical_score !== null && assessment.practical_score !== undefined) {
		practicalPassed = assessment.practical_score >= passingRule.practical_min_score;
	} else {
		// Fallback to checklist-based calculation if no practical_score
		practicalPassed = calculatePracticalPass(checklistItems);
	}

	// Calculate theory pass status based on theory_score if available
	let theoryPassed = assessment.theory_passed;
	if (assessment.theory_score !== null && assessment.theory_score !== undefined) {
		theoryPassed = assessment.theory_score >= passingRule.theory_min_score;
	}

	await sequelize.transaction(async (transaction) => {
		await Assessment.update(
			{
				status: AssessmentStatus.FINALIZED,
				aggregate_score: aggregateScore,
				practical_passed: practicalPassed,
				theory_passed: theoryPassed,
				finalized_at: new Date(),
				updated_by: actor.id,
			},
			{ where: { id }, transaction }
		);
	});

	const updated = await repository.findById(id);
	await notificationService.publishEventSafely({
		eventType: 'assessment.finalized',
		eventKey: `assessment:${id}:finalized`,
		referenceType: 'assessment',
		referenceId: id,
		userIds: [updated.mentee_id, updated.mentor_id],
		facilityIds: [updated.facility_id],
	});

	// Create progress snapshot after successful finalization
	try {
		await progressService.createSnapshotFromAssessment(updated, actor);
	} catch (error) {
		// Log error but don't fail the finalization
		// The assessment is already finalized successfully
		console.error(`Failed to create progress snapshot for assessment ${id}:`, error.message);
	}

	// Log the assessment finalization
	await logActivity({
		actorId: actor.id,
		action: 'assessment.finalized',
		entityType: 'assessment',
		entityId: id,
		facilityId: assessment.facility_id,
		outcome: 'success',
		metadata: { aggregate_score: aggregateScore },
	});

	return toAssessmentResponse(updated);
}

async function reviewAssessment(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization check - only facility admins and system admins can review
	if (!actor || (!SYSTEM_ADMIN_ROLES.includes(actor.role) && !FACILITY_ADMIN_ROLES.includes(actor.role))) {
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
	await notificationService.publishEventSafely({
		eventType: 'assessment.reviewed',
		eventKey: `assessment:${id}:reviewed`,
		referenceType: 'assessment',
		referenceId: id,
		userIds: [updated.mentee_id, updated.mentor_id],
		facilityIds: [updated.facility_id],
	});
	return toAssessmentResponse(updated);
}

async function setCriteriaScore(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	assertCanManageAssessmentResults(assessment, actor);
	if (await hasMappedQuiz(assessment, 'criteria')) {
		throw new AppError('Criteria scores are derived from the completed quiz and cannot be overridden manually.', 400, 'MANUAL_OVERRIDE_FORBIDDEN');
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

async function setTheoryScore(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	assertCanManageAssessmentResults(assessment, actor);
	if (await hasMappedQuiz(assessment, 'theory')) {
		throw new AppError('Theory scores are derived from the completed quiz and cannot be overridden manually.', 400, 'MANUAL_OVERRIDE_FORBIDDEN');
	}

	// Only draft or in-review assessments can be updated
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be updated.', 400, 'INVALID_STATUS');
	}

	const { theory_score } = payload;
	if (theory_score !== null && theory_score !== undefined) {
		if (typeof theory_score !== 'number' || theory_score < 0 || theory_score > 100) {
			throw new AppError('Theory score must be a number between 0 and 100.', 400, 'INVALID_SCORE');
		}
	}

	// Get active passing rule for theory threshold
	const passingRulesService = require('./assessment-passing-rules.service');
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	if (!passingRule) {
		throw new AppError('No active passing rule found. Please contact an administrator.', 500, 'NO_PASSING_RULE');
	}

	// Calculate theory_passed based on configured threshold
	const theory_passed = theory_score !== null && theory_score !== undefined ? theory_score >= passingRule.theory_min_score : null;

	await sequelize.transaction(async (transaction) => {
		await Assessment.update(
			{
				theory_score: theory_score !== null && theory_score !== undefined ? theory_score : null,
				theory_passed,
			},
			{ where: { id }, transaction }
		);
	});

	const updated = await repository.findWithIncludes(id);
	return toAssessmentDetailResponse(updated);
}

async function setChecklistItems(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization check
	if (actor && actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only update checklists for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.MENTEE) {
		throw new AppError('Mentees cannot update assessment checklists.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
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
		if (item.score !== null && item.score !== undefined) {
			if (typeof item.score !== 'number' || item.score < 0 || item.score > 4) {
				throw new AppError('Score must be an integer between 0 and 4.', 400, 'INVALID_SCORE');
			}
		}
		if (item.required !== undefined && typeof item.required !== 'boolean') {
			throw new AppError('Required must be a boolean.', 400, 'INVALID_REQUIRED');
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
					score: item.score !== null && item.score !== undefined ? item.score : null,
					required: item.required !== undefined ? item.required : false,
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
	if (actor && actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only add evidence for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.MENTEE && assessment.mentee_id !== actor.id) {
		throw new AppError('You can only add evidence to your own assessments.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
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

async function setPracticalResult(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	if (!actor || actor.role !== Role.MENTOR || Number(assessment.mentor_id) !== Number(actor.id)) {
		throw new AppError('Only the assigned mentor can submit a practical assessment.', 403, 'FORBIDDEN');
	}

	// Only draft or in-review assessments can be updated
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be updated.', 400, 'INVALID_STATUS');
	}

	const { practical_score, assessment_date, practical_feedback } = payload;

	// Validate practical score (1-5 scale)
	if (practical_score === undefined || practical_score === null) {
		throw new AppError('Practical score is required.', 400, 'MISSING_SCORE');
	}
	if (!Number.isInteger(practical_score) || practical_score < 1 || practical_score > 5) {
		throw new AppError('Practical score must be an integer between 1 and 5.', 400, 'INVALID_SCORE');
	}

	// Get active passing rule for practical threshold
	const passingRulesService = require('./assessment-passing-rules.service');
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	if (!passingRule) {
		throw new AppError('No active passing rule found. Please contact an administrator.', 500, 'NO_PASSING_RULE');
	}

	const practical_passed = practical_score >= passingRule.practical_min_score;

	await sequelize.transaction(async (transaction) => {
		await Assessment.update(
			{
				practical_score,
				practical_passed,
				practical_assessed_by: actor.id,
				practical_assessed_at: assessment_date ? new Date(assessment_date) : new Date(),
				practical_feedback: practical_feedback || null,
				updated_by: actor.id,
			},
			{ where: { id }, transaction }
		);
	});

	const updated = await repository.findWithIncludes(id);
	return toAssessmentDetailResponse(updated);
}

async function syncCriteriaScoresFromQuiz(assessmentId, actor) {
	const assessment = await repository.findById(assessmentId);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');
	assertCanManageAssessmentResults(assessment, actor);
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be updated.', 400, 'INVALID_STATUS');
	}

	const result = await getMappedQuizAttempt(assessment, 'criteria');
	if (!result.configured) return { synced: false, reason: result.reason };
	if (result.ambiguous) {
		throw new AppError(result.reason, 409, 'AMBIGUOUS_ASSESSMENT_QUIZZES');
	}
	if (!result.attempt) return { synced: false, reason: result.reason };

	const passingRulesService = require('./assessment-passing-rules.service');
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	const score = result.score;
	await sequelize.transaction(async (transaction) => {
		await AssessmentCriteriaScore.destroy({ where: { assessment_id: assessmentId }, transaction });
		await AssessmentCriteriaScore.create({
			assessment_id: assessmentId,
			criterion: `quiz:${result.quiz.id}:attempt:${result.attempt.id}`,
			score,
		}, { transaction });
		await Assessment.update({
			aggregate_score: score,
			status: assessment.status === AssessmentStatus.DRAFT ? AssessmentStatus.IN_REVIEW : assessment.status,
			updated_by: actor.id,
		}, { where: { id: assessmentId }, transaction });
	});

	return {
		synced: true,
		criteria_score: score,
		criteria_passed: score >= passingRule.criteria_min_score,
		quiz_id: result.quiz.id,
		quiz_attempt_id: result.attempt.id,
	};
}

async function syncTheoryScoreFromQuiz(assessmentId, actor) {
	const assessment = await repository.findById(assessmentId);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');
	assertCanManageAssessmentResults(assessment, actor);
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be updated.', 400, 'INVALID_STATUS');
	}

	const result = await getMappedQuizAttempt(assessment, 'theory');
	if (!result.configured) return { synced: false, reason: result.reason };
	if (result.ambiguous) {
		throw new AppError(result.reason, 409, 'AMBIGUOUS_ASSESSMENT_QUIZZES');
	}
	if (!result.attempt) return { synced: false, reason: result.reason };

	// Get active passing rule
	const passingRulesService = require('./assessment-passing-rules.service');
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	if (!passingRule) {
		return { synced: false, reason: 'No active passing rule found' };
	}

	const authoritativeScore = result.score;
	const theory_passed = authoritativeScore >= passingRule.theory_min_score;

	// Update assessment with quiz result
	await Assessment.update(
		{
			theory_score: authoritativeScore,
			theory_passed,
			updated_by: actor.id,
		},
		{ where: { id: assessmentId } }
	);

	return {
		synced: true,
		theory_score: authoritativeScore,
		theory_passed,
		quiz_id: result.quiz.id,
		quiz_attempt_id: result.attempt.id,
	};
}

async function getCertificateEligibility(assessmentId, actor) {
	const assessment = await repository.findWithIncludes(assessmentId);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization check
	if (actor && actor.role === Role.MENTOR && assessment.mentor_id !== actor.id) {
		throw new AppError('You can only view eligibility for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.MENTEE && assessment.mentee_id !== actor.id) {
		throw new AppError('You can only view your own eligibility.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
		throw new AppError('You can only view eligibility at your facility.', 403, 'FORBIDDEN');
	}

	// Get active passing rule
	const passingRulesService = require('./assessment-passing-rules.service');
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	if (!passingRule) {
		throw new AppError('No active passing rule found. Please contact an administrator.', 500, 'NO_PASSING_RULE');
	}

	const criteriaQuizResult = await getMappedQuizAttempt(assessment, 'criteria');
	const criteriaScore = criteriaQuizResult.attempt ? criteriaQuizResult.score : null;
	const criteriaCompleted = criteriaScore !== null;
	const criteriaStatus = criteriaQuizResult.ambiguous
		? 'pending'
		: !criteriaCompleted ? 'pending' : criteriaScore >= passingRule.criteria_min_score ? 'passed' : 'failed';

	const theoryQuizResult = await getMappedQuizAttempt(assessment, 'theory');
	const theoryScore = theoryQuizResult.attempt ? theoryQuizResult.score : null;
	const theoryCompleted = theoryScore !== null;
	const theoryStatus = theoryQuizResult.ambiguous
		? 'pending'
		: !theoryCompleted ? 'pending' : theoryScore >= passingRule.theory_min_score ? 'passed' : 'failed';

	// Eligibility requires a recorded practical result, not checklist-only scores.
	const practicalCompleted = assessment.practical_score !== null && assessment.practical_score !== undefined;
	const practicalStatus = !practicalCompleted
		? 'pending'
		: assessment.practical_score >= passingRule.practical_min_score ? 'passed' : 'failed';

	// Prerequisites
	const prerequisitesMet = assessment.prerequisites_met;

	// Assessment lifecycle state
	const lifecycleReady = assessment.status === AssessmentStatus.FINALIZED || assessment.status === AssessmentStatus.REVIEWED;

	// Overall eligibility
	const allComponentsCompleted = criteriaCompleted && theoryCompleted && practicalCompleted;
	const allComponentsPassed = criteriaStatus === 'passed' && theoryStatus === 'passed' && practicalStatus === 'passed';
	const eligible = allComponentsCompleted && allComponentsPassed && prerequisitesMet && lifecycleReady;

	const eligibilityStatus = !lifecycleReady ? 'pending' : !allComponentsCompleted ? 'pending' : !eligible ? 'not_eligible' : 'eligible';

	const unmetRequirements = [];
	if (!prerequisitesMet) unmetRequirements.push('Prerequisites are not met.');
	if (!lifecycleReady) unmetRequirements.push('Assessment must be finalized or reviewed.');
	if (criteriaStatus === 'failed') unmetRequirements.push('Criteria score is below the required minimum.');
	if (theoryStatus === 'failed') unmetRequirements.push('Theory score is below the required minimum.');
	if (practicalStatus === 'failed') unmetRequirements.push('Practical score is below the required minimum.');
	if (criteriaStatus === 'pending') unmetRequirements.push('Criteria assessment is incomplete.');
	if (theoryStatus === 'pending') unmetRequirements.push('Theory assessment is incomplete.');
	if (practicalStatus === 'pending') unmetRequirements.push('Practical assessment is incomplete.');

	return {
		mentee_id: assessment.mentee_id,
		assessment_id: assessment.id,
		eligibility_status: eligibilityStatus,
		eligible_for_certificate: eligible,
		components: {
			criteria: {
				score: criteriaScore,
				minimum_score: passingRule.criteria_min_score,
				status: criteriaStatus,
			},
			theory: {
				score: theoryScore,
				minimum_score: passingRule.theory_min_score,
				status: theoryStatus,
			},
			practical: {
				score: assessment.practical_score,
				minimum_score: passingRule.practical_min_score,
				status: practicalStatus,
			},
		},
		unmet_requirements: unmetRequirements,
		lifecycle_state: assessment.status,
		prerequisites_met: prerequisitesMet,
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
	setTheoryScore,
	setChecklistItems,
	addEvidence,
	setPracticalResult,
	syncTheoryScoreFromQuiz,
	syncCriteriaScoresFromQuiz,
	getCertificateEligibility,
};
