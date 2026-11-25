// src/services/assessments.service.js
const { sequelize, Assessment, AssessmentCriteriaScore, AssessmentChecklistItem, AssessmentEvidence, User, Facility, MentorshipCycle, ThematicArea, Assignment, QuizAttempt } = require('../models');
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
const passingRulesService = require('./assessment-passing-rules.service');

const ASSESSMENT_FIELDS = [
	'mentee_id', 'mentor_id', 'facility_id', 'cycle_id', 'thematic_area_id', 'status',
	'aggregate_score', 'feedback', 'prerequisites_met',
	'practical_passed', 'practical_score', 'practical_assessed_by', 'practical_assessed_at',
	'practical_feedback', 'practical_checklist_id', 'practical_checklist_version',
	'pre_test_score', 'pre_test_passed', 'pre_test_quiz_id', 'pre_test_quiz_attempt_id', 'pre_test_synced_at',
	'post_test_score', 'post_test_passed', 'post_test_quiz_id', 'post_test_quiz_attempt_id', 'post_test_synced_at',
	'passing_rule_id', 'passing_rule_snapshot', 'finalized_at',
];

// Quiz stage terminology. assessment_stage on quizzes/attempts is the
// authoritative configuration; assessment_component ('pre_test'/'post_test',
// legacy 'criteria'/'theory') is supported for historical rows.
const STAGE_TO_COMPONENT = { PRETEST: 'pre_test', POST_TEST: 'post_test' };
const COMPONENT_TO_STAGE = {
	pre_test: 'PRETEST', criteria: 'PRETEST',
	post_test: 'POST_TEST', theory: 'POST_TEST',
};
const COMPONENT_ALIASES = {
	pre_test: ['pre_test', 'criteria'],
	post_test: ['post_test', 'theory'],
};

function normalizeStage(input) {
	if (!input) return null;
	const value = String(input).toUpperCase();
	if (value === 'PRETEST' || value === 'PRE_TEST') return 'PRETEST';
	if (value === 'POST_TEST' || value === 'POSTTEST') return 'POST_TEST';
	return COMPONENT_TO_STAGE[input] || null;
}

const PRACTICAL_RESPONSE_STATUSES = ['performed_correctly', 'needs_improvement', 'not_observed', 'not_applicable'];

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
		response.pre_test_scores = value.criteriaScores.map((cs) => ({
			id: cs.id,
			criterion: cs.criterion,
			score: cs.score,
		}));
	}

	if (value.checklistItems) {
		response.checklist_items = value.checklistItems.map((ci) => ({
			id: ci.id,
			checklist_item_id: ci.checklist_item_id ?? null,
			item: ci.item,
			checked: ci.checked,
			score: ci.score,
			required: ci.required,
			response_status: ci.response_status ?? null,
			comment: ci.comment ?? null,
			not_applicable_reason: ci.not_applicable_reason ?? null,
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

// Returns the quizzes mapped to an assessment for a given stage. Quizzes are
// matched by assessment_stage (authoritative) or the legacy
// assessment_component value, and may be owned by the thematic area directly
// or by any published/authorized module of that thematic area.
async function findMappedQuizzes(assessment, stage) {
	if (assessment.thematic_area_id === null || assessment.thematic_area_id === undefined) {
		return { configured: false, reason: 'Assessment has no thematic area mapped.', quizzes: [] };
	}

	const { LearningModule, Quiz } = require('../models');
	const component = STAGE_TO_COMPONENT[stage];
	const componentAliases = COMPONENT_ALIASES[component] || [component];
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

	const ownership = [{ thematic_area_id: assessment.thematic_area_id }];
	if (moduleIds.length > 0) ownership.push({ module_id: { [Op.in]: moduleIds } });

	const quizzes = await Quiz.findAll({
		where: {
			[Op.and]: [
				{ [Op.or]: ownership },
				{
					[Op.or]: [
						{ assessment_stage: stage },
						{ assessment_component: { [Op.in]: componentAliases } },
					],
				},
			],
			is_published: true,
			is_authorized: true,
		},
		order: [['id', 'ASC']],
	});
	return { configured: true, quizzes };
}

async function getMappedQuizAttempt(assessment, componentOrStage) {
	const stage = normalizeStage(componentOrStage);
	if (!stage) {
		return { configured: false, reason: `Unknown assessment component '${componentOrStage}'.`, quizzes: [] };
	}

	const mapped = await findMappedQuizzes(assessment, stage);
	if (!mapped.configured) return { ...mapped, reason: mapped.reason };
	if (mapped.quizzes.length === 0) {
		return {
			configured: false,
			reason: `No published and authorized ${stage === 'PRETEST' ? 'pre-test' : 'post-test'} quiz is mapped for this assessment.`,
			quizzes: [],
		};
	}
	if (mapped.quizzes.length > 1) {
		return {
			configured: true,
			ambiguous: true,
			reason: `Multiple ${stage === 'PRETEST' ? 'pre-test' : 'post-test'} quizzes are mapped for this assessment scope.`,
			quizzes: mapped.quizzes,
		};
	}

	const quiz = mapped.quizzes[0];
	const attemptNumberWhere = Number(quiz.attempt_limit) > 0
		? { [Op.between]: [1, Number(quiz.attempt_limit)] }
		: { [Op.gte]: 1 };
	const cycleScope = assessment.cycle_id
		? { [Op.or]: [{ cycle_id: assessment.cycle_id }, { cycle_id: null }] }
		: {};
	const attempt = await QuizAttempt.findOne({
		where: {
			quiz_id: quiz.id,
			mentee_id: assessment.mentee_id,
			status: 'completed',
			completed_at: { [Op.ne]: null },
			attempt_number: attemptNumberWhere,
			...cycleScope,
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
		return { configured: true, quiz, quizzes: mapped.quizzes, reason: 'No valid completed quiz attempt found.' };
	}

	// Passing thresholds are percentages (0-100); prefer the attempt's
	// percentage_score and fall back to the raw score for legacy attempts.
	const scoreValue = attempt.percentage_score ?? attempt.score;
	if (scoreValue === null || scoreValue === undefined || scoreValue === '') {
		return { configured: true, quiz, quizzes: mapped.quizzes, reason: 'Completed quiz attempt has an invalid score.' };
	}
	const score = Number(scoreValue);
	if (!Number.isFinite(score) || score < 0 || score > 100) {
		return { configured: true, quiz, quizzes: mapped.quizzes, reason: 'Completed quiz attempt has an invalid score.' };
	}
	return { configured: true, quiz, quizzes: mapped.quizzes, attempt, score };
}

async function hasMappedQuiz(assessment, componentOrStage) {
	const stage = normalizeStage(componentOrStage);
	if (!stage) return false;
	if (assessment.thematic_area_id === null || assessment.thematic_area_id === undefined) return false;
	const mapped = await findMappedQuizzes(assessment, stage);
	return mapped.quizzes.length > 0;
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

function passingRuleSnapshot(rule) {
	if (!rule) return null;
	const value = rule.toJSON ? rule.toJSON() : rule;
	const thresholds = passingRulesService.ruleThresholds(value);
	return {
		id: value.id ?? null,
		cycle_id: value.cycle_id ?? null,
		thematic_area_id: value.thematic_area_id ?? null,
		pre_test_threshold: thresholds.pre_test ?? null,
		post_test_threshold: thresholds.post_test ?? null,
		practical_threshold: thresholds.practical ?? null,
	};
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

	// Pre-test is informational and optional: finalization never requires a
	// pre-test result. When one exists (a synced quiz score or manually
	// recorded rubric rows) it is summarized below for reporting only.
	const criteriaScores = await AssessmentCriteriaScore.findAll({ where: { assessment_id: id } });
	const hasSyncedPreTest = assessment.pre_test_score !== null && assessment.pre_test_score !== undefined;
	const scoredCriteria = criteriaScores.filter((cs) => cs.score !== null && cs.score !== undefined);

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

	// Get the applicable active passing rule configured by the Super Admin.
	// There is no hardcoded fallback: a missing rule is a configuration error.
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	if (!passingRule) {
		throw new AppError('No active passing rule is configured for this assessment scope. Please contact an administrator.', 422, 'NO_ACTIVE_PASSING_RULE');
	}
	const thresholds = passingRulesService.ruleThresholds(passingRule);

	// Pre-test summary (informational only): the synced quiz result takes
	// precedence, otherwise the average of recorded pre-test (criteria) rubric
	// scores. When no pre-test data exists these stay null.
	const hasPreTestData = hasSyncedPreTest || scoredCriteria.length > 0;
	const aggregateScore = hasSyncedPreTest
		? Number(assessment.pre_test_score)
		: hasPreTestData ? scoredCriteria.reduce((sum, cs) => sum + cs.score, 0) / scoredCriteria.length : null;
	const preTestPassed = aggregateScore !== null ? aggregateScore >= thresholds.pre_test : null;

	// Post-test score: synced quiz result (post_test_score) with legacy
	// theory_score fallback.
	const postTestScore = assessment.post_test_score ?? assessment.theory_score ?? null;
	const postTestPassed = postTestScore !== null && postTestScore !== undefined
		? postTestScore >= thresholds.post_test
		: null;

	// Calculate practical pass status based on practical_score (1-5 scale) if available
	let practicalPassed = null;
	if (assessment.practical_score !== null && assessment.practical_score !== undefined) {
		practicalPassed = assessment.practical_score >= thresholds.practical;
	} else {
		// Fallback to checklist-based calculation if no practical_score
		practicalPassed = calculatePracticalPass(checklistItems);
	}

	await sequelize.transaction(async (transaction) => {
		await Assessment.update(
			{
				status: AssessmentStatus.FINALIZED,
				aggregate_score: aggregateScore,
				pre_test_score: hasSyncedPreTest ? assessment.pre_test_score : aggregateScore,
				pre_test_passed: preTestPassed,
				post_test_score: postTestScore,
				post_test_passed: postTestPassed,
				practical_passed: practicalPassed,
				passing_rule_id: passingRule.id ?? null,
				passing_rule_snapshot: passingRuleSnapshot(passingRule),
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

async function setPreTestScores(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	assertCanManageAssessmentResults(assessment, actor);
	if (await hasMappedQuiz(assessment, 'PRETEST')) {
		throw new AppError('Pre-test scores are derived from the completed quiz and cannot be overridden manually.', 400, 'MANUAL_OVERRIDE_FORBIDDEN');
	}

	// Only draft or in-review assessments can be scored
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be scored.', 400, 'INVALID_STATUS');
	}

	const { criteria_scores, pre_test_scores } = payload;
	const scores = criteria_scores || pre_test_scores;
	if (!Array.isArray(scores) || scores.length === 0) {
		throw new AppError('Pre-test scores must be a non-empty array.', 400, 'INVALID_PRE_TEST_SCORES');
	}

	// Validate score values
	for (const cs of scores) {
		if (cs.score !== null && cs.score !== undefined) {
			if (typeof cs.score !== 'number' || cs.score < 0 || cs.score > 100) {
				throw new AppError('Scores must be numbers between 0 and 100.', 400, 'INVALID_SCORE_VALUE');
			}
		}
		if (!cs.criterion || typeof cs.criterion !== 'string' || cs.criterion.trim().length === 0) {
			throw new AppError('Each criterion must have a non-empty string value.', 400, 'INVALID_PRE_TEST_CRITERION');
		}
	}

	await sequelize.transaction(async (transaction) => {
		// Delete existing pre-test (criteria) scores for this assessment
		await AssessmentCriteriaScore.destroy({ where: { assessment_id: id }, transaction });

		// Create new pre-test scores
		for (const cs of scores) {
			await AssessmentCriteriaScore.create(
				{
					assessment_id: id,
					criterion: cs.criterion.trim(),
					score: cs.score,
				},
				{ transaction }
			);
		}

		// Update assessment status to in_review if pre-test scores are provided
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

async function setPostTestScore(id, payload, actor) {
	const assessment = await repository.findById(id);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	assertCanManageAssessmentResults(assessment, actor);
	if (await hasMappedQuiz(assessment, 'POST_TEST')) {
		throw new AppError('Post-test scores are derived from the completed quiz and cannot be overridden manually.', 400, 'MANUAL_OVERRIDE_FORBIDDEN');
	}

	// Only draft or in-review assessments can be updated
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be updated.', 400, 'INVALID_STATUS');
	}

	const postTestScore = payload.post_test_score ?? payload.theory_score;
	if (postTestScore !== null && postTestScore !== undefined) {
		if (typeof postTestScore !== 'number' || postTestScore < 0 || postTestScore > 100) {
			throw new AppError('Post-test score must be a number between 0 and 100.', 400, 'INVALID_SCORE');
		}
	}

	// Get the applicable active passing rule for the post-test threshold
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	if (!passingRule) {
		throw new AppError('No active passing rule is configured for this assessment scope. Please contact an administrator.', 422, 'NO_ACTIVE_PASSING_RULE');
	}
	const thresholds = passingRulesService.ruleThresholds(passingRule);

	// Calculate post_test_passed based on configured threshold
	const postTestPassed = postTestScore !== null && postTestScore !== undefined ? postTestScore >= thresholds.post_test : null;

	await sequelize.transaction(async (transaction) => {
		await Assessment.update(
			{
				// Canonical post-test fields plus legacy theory mirrors.
				post_test_score: postTestScore !== null && postTestScore !== undefined ? postTestScore : null,
				post_test_passed: postTestPassed,
				theory_score: postTestScore !== null && postTestScore !== undefined ? postTestScore : null,
				theory_passed: postTestPassed,
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

	// Get the applicable active passing rule for the practical threshold
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	if (!passingRule) {
		throw new AppError('No active passing rule is configured for this assessment scope. Please contact an administrator.', 422, 'NO_ACTIVE_PASSING_RULE');
	}
	const thresholds = passingRulesService.ruleThresholds(passingRule);

	const practical_passed = practical_score >= thresholds.practical;

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

// ---------------------------------------------------------------------------
// Pre-test / post-test quiz synchronization
// ---------------------------------------------------------------------------

// Applies an already-resolved quiz result to one assessment. Used both by the
// manual sync endpoints and by automatic synchronization on quiz submission.
// `result` must contain { quiz, attempt, score }.
async function applyQuizResultToAssessment(assessment, stage, result, actorId = null) {
	const thresholds = await resolvePassingThresholds(assessment);
	const isPreTest = stage === 'PRETEST';
	const score = Number(result.score);
	const passed = score >= (isPreTest ? thresholds.pre_test : thresholds.post_test);
	const now = new Date();

	const updateData = isPreTest
		? {
			pre_test_score: score,
			pre_test_passed: passed,
			pre_test_quiz_id: result.quiz.id,
			pre_test_quiz_attempt_id: result.attempt.id,
			pre_test_synced_at: now,
			// Legacy mirrors kept for existing clients.
			aggregate_score: score,
		}
		: {
			post_test_score: score,
			post_test_passed: passed,
			post_test_quiz_id: result.quiz.id,
			post_test_quiz_attempt_id: result.attempt.id,
			post_test_synced_at: now,
			// Legacy mirrors kept for existing clients.
			theory_score: score,
			theory_passed: passed,
		};
	if (assessment.status === AssessmentStatus.DRAFT) {
		updateData.status = AssessmentStatus.IN_REVIEW;
	}
	if (actorId !== null && actorId !== undefined) updateData.updated_by = actorId;

	await sequelize.transaction(async (transaction) => {
		if (isPreTest) {
			// Replace only quiz-derived pre-test rows; manually recorded rubric
			// rows are preserved.
			await AssessmentCriteriaScore.destroy({
				where: {
					assessment_id: assessment.id,
					criterion: { [Op.like]: 'quiz:%' },
				},
				transaction,
			});
			await AssessmentCriteriaScore.create({
				assessment_id: assessment.id,
				criterion: `quiz:${result.quiz.id}:attempt:${result.attempt.id}`,
				score,
			}, { transaction });
		}
		await Assessment.update(updateData, { where: { id: assessment.id }, transaction });
	});

	return {
		synced: true,
		stage,
		score,
		passed,
		quiz_id: result.quiz.id,
		quiz_attempt_id: result.attempt.id,
		attempt_number: result.attempt.attempt_number ?? null,
		completed_at: result.attempt.completed_at ?? null,
	};
}

async function resolvePassingThresholds(assessment) {
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	if (!passingRule) {
		throw new AppError('No active passing rule is configured for this assessment scope. Please contact an administrator.', 422, 'NO_ACTIVE_PASSING_RULE');
	}
	return passingRulesService.ruleThresholds(passingRule);
}

async function syncQuizComponentFromAttempt(assessmentId, componentOrStage, actor) {
	const assessment = await repository.findById(assessmentId);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');
	assertCanManageAssessmentResults(assessment, actor);
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be updated.', 400, 'INVALID_STATUS');
	}

	const stage = normalizeStage(componentOrStage);
	const result = await getMappedQuizAttempt(assessment, stage);
	if (!result.configured) return { synced: false, stage, reason: result.reason };
	if (result.ambiguous) {
		throw new AppError(result.reason, 409, 'AMBIGUOUS_ASSESSMENT_QUIZZES');
	}
	if (!result.attempt) return { synced: false, stage, reason: result.reason };

	const applied = await applyQuizResultToAssessment(assessment, stage, result, actor.id);
	return applied;
}

async function syncPreTestFromQuiz(assessmentId, actor) {
	return syncQuizComponentFromAttempt(assessmentId, 'PRETEST', actor);
}

async function syncPostTestFromQuiz(assessmentId, actor) {
	return syncQuizComponentFromAttempt(assessmentId, 'POST_TEST', actor);
}

// Automatic synchronization: called when a quiz attempt is completed. Finds
// draft/in-review assessments for the same mentee, cycle and thematic area and
// applies the completed attempt when its quiz is the mapped quiz for the
// attempt's stage. Idempotent and safe to call repeatedly.
async function syncCompletedQuizAttempt({ quiz, attempt, assessmentStage, cycleId, thematicAreaId }) {
	const stage = normalizeStage(assessmentStage || quiz?.assessment_stage);
	if (!stage || !attempt || !quiz) return { synced: 0, skipped: 0, reason: 'Not an assessment-stage quiz attempt.' };

	const { LearningModule } = require('../models');
	let areaId = thematicAreaId ?? quiz.thematic_area_id ?? null;
	if (!areaId && quiz.module_id) {
		const module = await LearningModule.findByPk(quiz.module_id, { attributes: ['thematic_area_id'] });
		areaId = module?.thematic_area_id ?? null;
	}
	if (!areaId) return { synced: 0, skipped: 0, reason: 'Quiz is not scoped to a thematic area.' };

	const where = {
		mentee_id: attempt.mentee_id,
		thematic_area_id: areaId,
		status: { [Op.in]: [AssessmentStatus.DRAFT, AssessmentStatus.IN_REVIEW] },
	};
	if (cycleId !== undefined && cycleId !== null) where.cycle_id = cycleId;
	const assessments = await Assessment.findAll({ where });

	let synced = 0;
	let skipped = 0;
	for (const assessment of assessments) {
		try {
			// The completed quiz must be the (unambiguous) mapped quiz for this
			// stage, otherwise the attempt does not belong to this assessment.
			const mapped = await findMappedQuizzes(assessment, stage);
			if (mapped.quizzes.length !== 1 || Number(mapped.quizzes[0].id) !== Number(quiz.id)) {
				skipped += 1;
				continue;
			}
			// Latest completed attempt wins: never let an older attempt overwrite
			// a newer synced result.
			const syncedAttemptId = stage === 'PRETEST' ? assessment.pre_test_quiz_attempt_id : assessment.post_test_quiz_attempt_id;
			if (syncedAttemptId && Number(syncedAttemptId) !== Number(attempt.id)) {
				const previous = await QuizAttempt.findByPk(syncedAttemptId, { attributes: ['completed_at'] });
				const previousCompleted = previous?.completed_at ? new Date(previous.completed_at) : null;
				const currentCompleted = attempt.completed_at ? new Date(attempt.completed_at) : null;
				if (previousCompleted && currentCompleted && currentCompleted < previousCompleted) {
					skipped += 1;
					continue;
				}
			}
			const score = Number(attempt.percentage_score ?? attempt.score);
			if (!Number.isFinite(score) || score < 0 || score > 100) {
				skipped += 1;
				continue;
			}
			const result = { quiz, attempt, score };
			await applyQuizResultToAssessment(assessment, stage, result);
			synced += 1;
		} catch (error) {
			// A missing passing rule or other per-assessment issue must not fail
			// the quiz submission itself.
			console.error(`Auto-sync of quiz attempt ${attempt.id} to assessment ${assessment.id} failed:`, error.message);
			skipped += 1;
		}
	}
	return { synced, skipped };
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

	// The applicable active passing rule configured by the Super Admin is the
	// source of truth. Missing configuration is an explicit error, never a
	// hardcoded fallback.
	const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
	if (!passingRule) {
		throw new AppError('No active passing rule is configured for this assessment scope. Please contact an administrator.', 422, 'NO_ACTIVE_PASSING_RULE');
	}
	const thresholds = passingRulesService.ruleThresholds(passingRule);

	// Pre-test is diagnostic/informational: it is recorded and reported but is
	// NOT a certificate eligibility requirement. A missing or failed pre-test
	// never blocks eligibility.
	const preTestQuizResult = await getMappedQuizAttempt(assessment, 'PRETEST');
	const preTestScore = assessment.pre_test_score ?? (preTestQuizResult.attempt ? preTestQuizResult.score : null);
	const preTestCompleted = preTestScore !== null && preTestScore !== undefined;
	const preTestStatus = preTestQuizResult.ambiguous && assessment.pre_test_score == null
		? 'pending'
		: !preTestCompleted ? 'pending' : preTestScore >= thresholds.pre_test ? 'passed' : 'failed';

	// Post-test: mandatory score-based requirement. Prefer the synced quiz
	// result stored on the assessment; fall back to a live lookup of the
	// mapped quiz attempt for legacy records.
	const postTestQuizResult = await getMappedQuizAttempt(assessment, 'POST_TEST');
	const postTestScore = assessment.post_test_score ?? assessment.theory_score ?? (postTestQuizResult.attempt ? postTestQuizResult.score : null);
	const postTestCompleted = postTestScore !== null && postTestScore !== undefined;
	const postTestStatus = postTestQuizResult.ambiguous && assessment.post_test_score == null && assessment.theory_score == null
		? 'pending'
		: !postTestCompleted ? 'pending' : postTestScore >= thresholds.post_test ? 'passed' : 'failed';

	// Eligibility requires a recorded practical result, not checklist-only scores.
	const practicalCompleted = assessment.practical_score !== null && assessment.practical_score !== undefined;
	const practicalStatus = !practicalCompleted
		? 'pending'
		: assessment.practical_score >= thresholds.practical ? 'passed' : 'failed';

	// Prerequisites
	const prerequisitesMet = assessment.prerequisites_met;

	// Assessment lifecycle state
	const lifecycleReady = assessment.status === AssessmentStatus.FINALIZED || assessment.status === AssessmentStatus.REVIEWED;

	// Overall eligibility: only Post-Test and Practical are score-based
	// certificate requirements. Pre-Test is informational and excluded.
	const requiredComponentsCompleted = postTestCompleted && practicalCompleted;
	const requiredComponentsPassed = postTestStatus === 'passed' && practicalStatus === 'passed';
	const eligible = requiredComponentsCompleted && requiredComponentsPassed && prerequisitesMet && lifecycleReady;

	const eligibilityStatus = !lifecycleReady ? 'pending' : !requiredComponentsCompleted ? 'pending' : !eligible ? 'not_eligible' : 'eligible';

	const unmetRequirements = [];
	if (!prerequisitesMet) unmetRequirements.push('Prerequisites are not met.');
	if (!lifecycleReady) unmetRequirements.push('Assessment must be finalized or reviewed.');
	if (postTestStatus === 'failed') unmetRequirements.push('Post-test score is below the required minimum.');
	if (practicalStatus === 'failed') unmetRequirements.push('Practical score is below the required minimum.');
	if (postTestStatus === 'pending') unmetRequirements.push('Post-test assessment is incomplete.');
	if (practicalStatus === 'pending') unmetRequirements.push('Practical assessment is incomplete.');

	const preTestComponent = {
		score: preTestScore,
		minimum_score: thresholds.pre_test,
		status: preTestStatus,
		informational: true,
		required_for_certificate: false,
		quiz_id: assessment.pre_test_quiz_id ?? preTestQuizResult.quiz?.id ?? null,
		quiz_attempt_id: assessment.pre_test_quiz_attempt_id ?? preTestQuizResult.attempt?.id ?? null,
	};
	const postTestComponent = {
		score: postTestScore,
		minimum_score: thresholds.post_test,
		status: postTestStatus,
		required_for_certificate: true,
		quiz_id: assessment.post_test_quiz_id ?? postTestQuizResult.quiz?.id ?? null,
		quiz_attempt_id: assessment.post_test_quiz_attempt_id ?? postTestQuizResult.attempt?.id ?? null,
	};
	const practicalComponent = {
		score: assessment.practical_score,
		minimum_score: thresholds.practical,
		status: practicalStatus,
		required_for_certificate: true,
		checklist_id: assessment.practical_checklist_id ?? null,
		checklist_version: assessment.practical_checklist_version ?? null,
	};

	return {
		mentee_id: assessment.mentee_id,
		assessment_id: assessment.id,
		eligibility_status: eligibilityStatus,
		eligible_for_certificate: eligible,
		components: {
			pre_test: preTestComponent,
			post_test: postTestComponent,
			practical: practicalComponent,
		},
		passing_rule: passingRuleSnapshot(passingRule),
		unmet_requirements: unmetRequirements,
		lifecycle_state: assessment.status,
		prerequisites_met: prerequisitesMet,
	};
}

// ---------------------------------------------------------------------------
// Practical assessment: versioned checklist templates + mentor evaluation
// ---------------------------------------------------------------------------

async function getApplicablePracticalChecklists(assessmentId, actor, { procedure } = {}) {
	const assessment = await repository.findById(assessmentId);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Authorization: assigned mentor, facility admin in scope, or system admin.
	if (actor && actor.role === Role.MENTOR && Number(assessment.mentor_id) !== Number(actor.id)) {
		throw new AppError('You can only view practical checklists for your mentees.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.MENTEE) {
		throw new AppError('Mentees cannot view practical checklists.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assessment.facility_id)) {
		throw new AppError('You can only view practical checklists at your facility.', 403, 'FORBIDDEN');
	}
	if (!actor) throw new AppError('You do not have permission to view practical checklists.', 403, 'FORBIDDEN');

	const { PracticalChecklist, PracticalChecklistItem } = require('../models');
	const where = {
		thematic_area_id: assessment.thematic_area_id,
		status: 'published',
	};
	const checklists = await PracticalChecklist.findAll({
		where,
		include: [{
			model: PracticalChecklistItem,
			as: 'items',
			attributes: ['id', 'item_text', 'sort_order', 'is_required', 'is_critical'],
		}],
		order: [['procedure', 'ASC'], ['version', 'DESC']],
	});

	let filtered = checklists;
	if (procedure) {
		const needle = String(procedure).trim().toLowerCase();
		filtered = checklists.filter((checklist) =>
			String(checklist.procedure).toLowerCase().includes(needle)
			|| String(checklist.title).toLowerCase().includes(needle));
	}
	// Only the newest published version per procedure is applicable.
	const latestByProcedure = new Map();
	for (const checklist of filtered) {
		const key = String(checklist.procedure).toLowerCase();
		const existing = latestByProcedure.get(key);
		if (!existing || Number(checklist.version) > Number(existing.version)) {
			latestByProcedure.set(key, checklist);
		}
	}

	return {
		thematic_area_id: assessment.thematic_area_id,
		checklists: [...latestByProcedure.values()].map((checklist) => {
			const value = checklist.toJSON ? checklist.toJSON() : checklist;
			return {
				id: value.id,
				thematic_area_id: value.thematic_area_id,
				procedure: value.procedure,
				title: value.title,
				description: value.description,
				version: value.version,
				status: value.status,
				published_at: value.published_at,
				items: (value.items || []).map((item) => ({
					id: item.id,
					item_text: item.item_text,
					sort_order: item.sort_order,
					is_required: item.is_required,
					is_critical: item.is_critical,
				})),
			};
		}),
	};
}

async function submitPracticalEvaluation(assessmentId, payload, actor) {
	const assessment = await repository.findById(assessmentId);
	if (!assessment) throw new AppError('Assessment was not found.', 404, 'ASSESSMENT_NOT_FOUND');

	// Only the assigned mentor submits practical evaluations.
	if (!actor || actor.role !== Role.MENTOR || Number(assessment.mentor_id) !== Number(actor.id)) {
		throw new AppError('Only the assigned mentor can submit a practical assessment.', 403, 'FORBIDDEN');
	}
	if (assessment.status !== AssessmentStatus.DRAFT && assessment.status !== AssessmentStatus.IN_REVIEW) {
		throw new AppError('Only draft or in-review assessments can be updated.', 400, 'INVALID_STATUS');
	}

	const { PracticalChecklist, PracticalChecklistItem } = require('../models');
	const { checklist_id, responses = [], practical_score, practical_feedback, submit = false } = payload || {};
	if (!checklist_id) throw new AppError('checklist_id is required.', 400, 'VALIDATION_ERROR');

	const checklist = await PracticalChecklist.findByPk(checklist_id, {
		include: [{ model: PracticalChecklistItem, as: 'items' }],
	});
	if (!checklist) throw new AppError('Practical checklist was not found.', 404, 'CHECKLIST_NOT_FOUND');
	if (checklist.status !== 'published') {
		throw new AppError('Only published practical checklists can be used for evaluation.', 409, 'CHECKLIST_NOT_PUBLISHED');
	}
	if (Number(checklist.thematic_area_id) !== Number(assessment.thematic_area_id)) {
		throw new AppError('The checklist does not belong to this assessment thematic area.', 400, 'CHECKLIST_SCOPE_MISMATCH');
	}

	const templateItems = checklist.items || [];
	const templateItemIds = new Set(templateItems.map((item) => Number(item.id)));
	const responseByItem = new Map();
	for (const response of responses) {
		const itemId = Number(response.checklist_item_id);
		if (!templateItemIds.has(itemId)) {
			throw new AppError(`Response references checklist item ${response.checklist_item_id} which is not part of this checklist.`, 400, 'INVALID_CHECKLIST_ITEM');
		}
		if (responseByItem.has(itemId)) {
			throw new AppError('Each checklist item may only be evaluated once.', 400, 'VALIDATION_ERROR');
		}
		if (!PRACTICAL_RESPONSE_STATUSES.includes(response.status)) {
			throw new AppError(`Response status must be one of: ${PRACTICAL_RESPONSE_STATUSES.join(', ')}.`, 400, 'INVALID_RESPONSE_STATUS');
		}
		if (response.status === 'not_applicable' && !(response.not_applicable_reason || '').trim()) {
			throw new AppError('A reason is required when a checklist item is marked not_applicable.', 400, 'REASON_REQUIRED');
		}
		if (response.score !== undefined && response.score !== null
			&& (!Number.isInteger(Number(response.score)) || Number(response.score) < 0 || Number(response.score) > 4)) {
			throw new AppError('Item score must be an integer between 0 and 4.', 400, 'INVALID_SCORE');
		}
		responseByItem.set(itemId, response);
	}

	// On submit, every required item must have a response.
	if (submit) {
		const missing = templateItems.filter((item) => item.is_required && !responseByItem.has(Number(item.id)));
		if (missing.length > 0) {
			throw new AppError(`All required checklist items must be evaluated before submitting. Missing: ${missing.map((item) => item.item_text).join('; ')}`, 400, 'INCOMPLETE_CHECKLIST');
		}
	}

	// Optional overall practical rating (1-5) follows the existing contract.
	let practicalUpdate = {};
	if (practical_score !== undefined && practical_score !== null) {
		if (!Number.isInteger(Number(practical_score)) || Number(practical_score) < 1 || Number(practical_score) > 5) {
			throw new AppError('Practical score must be an integer between 1 and 5.', 400, 'INVALID_SCORE');
		}
		const passingRule = await passingRulesService.getActivePassingRule(assessment.cycle_id, assessment.thematic_area_id);
		if (!passingRule) {
			throw new AppError('No active passing rule is configured for this assessment scope. Please contact an administrator.', 422, 'NO_ACTIVE_PASSING_RULE');
		}
		const thresholds = passingRulesService.ruleThresholds(passingRule);
		practicalUpdate = {
			practical_score: Number(practical_score),
			practical_passed: Number(practical_score) >= thresholds.practical,
			practical_assessed_by: actor.id,
			practical_assessed_at: new Date(),
			practical_feedback: practical_feedback || null,
		};
	}

	await sequelize.transaction(async (transaction) => {
		// Template-based responses are replaced wholesale so re-saving a draft
		// or switching checklist versions never duplicates rows. Legacy
		// free-form rows (checklist_item_id IS NULL) are preserved.
		await AssessmentChecklistItem.destroy({
			where: {
				assessment_id: assessmentId,
				checklist_item_id: { [Op.ne]: null },
			},
			transaction,
		});
		for (const item of templateItems) {
			const response = responseByItem.get(Number(item.id));
			await AssessmentChecklistItem.create({
				assessment_id: assessmentId,
				checklist_item_id: item.id,
				item: item.item_text,
				checked: response?.status === 'performed_correctly',
				score: response?.score ?? null,
				required: Boolean(item.is_required),
				response_status: response?.status ?? null,
				comment: response?.comment ?? null,
				not_applicable_reason: response?.not_applicable_reason ?? null,
			}, { transaction });
		}
		await Assessment.update({
			practical_checklist_id: checklist.id,
			practical_checklist_version: checklist.version,
			...(submit && practical_score === undefined ? { practical_assessed_at: new Date(), practical_assessed_by: actor.id } : {}),
			...practicalUpdate,
			updated_by: actor.id,
		}, { where: { id: assessmentId }, transaction });
	});

	const updated = await repository.findWithIncludes(assessmentId);
	const detail = toAssessmentDetailResponse(updated);
	const summary = {
		total_items: templateItems.length,
		responded: responseByItem.size,
		performed_correctly: templateItems.filter((item) => responseByItem.get(Number(item.id))?.status === 'performed_correctly').length,
		needs_improvement: templateItems.filter((item) => responseByItem.get(Number(item.id))?.status === 'needs_improvement').length,
		not_observed: templateItems.filter((item) => responseByItem.get(Number(item.id))?.status === 'not_observed').length,
		not_applicable: templateItems.filter((item) => responseByItem.get(Number(item.id))?.status === 'not_applicable').length,
		submitted: Boolean(submit),
	};
	detail.practical_evaluation = summary;
	return detail;
}

module.exports = {
	listAssessments,
	getAssessment,
	createAssessment,
	updateAssessment,
	finalizeAssessment,
	reviewAssessment,
	setPreTestScores,
	setPostTestScore,
	setChecklistItems,
	addEvidence,
	setPracticalResult,
	syncPreTestFromQuiz,
	syncPostTestFromQuiz,
	syncCompletedQuizAttempt,
	getCertificateEligibility,
	getApplicablePracticalChecklists,
	submitPracticalEvaluation,
};
