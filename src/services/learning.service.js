const repository = require('../repositories/learning.repository');
const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const LearningExaminationStage = require('../enums/learning-examination-stage.enum');
const { SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const notificationService = require('./notifications.service');
const NotificationType = require('../enums/notification-type.enum');
const resourceProgressService = require('./learning-resource-progress.service');
const { Op } = require('sequelize');

const normalizeRole = (role) => String(role || '').toLowerCase();
const isSystemAdmin = (role) => SYSTEM_ADMIN_ROLES.includes(normalizeRole(role));
const isFacilityAdmin = (role) => normalizeRole(role) === Role.FACILITY_ADMIN;
const isModulePublishedAndAuthorized = (module) => (
	Boolean(module.is_published)
	&& Boolean(module.is_authorized)
	&& String(module.status).toLowerCase() === 'published'
);
const actorUserId = (actor = {}) => actor.id ?? actor.userId;

const normalizePublicationPayload = (payload = {}) => {
	const status = String(payload.status || '').toLowerCase();
	if (status === 'published') {
		return { ...payload, status: 'published', isPublished: true, isAuthorized: true };
	}
	if (status === 'draft') {
		return { ...payload, status: 'draft', isPublished: false, isAuthorized: false };
	}
	return payload;
};

const ensureModule = async (moduleId) => {
	const module = await repository.getModuleById(moduleId);
	if (!module) throw new AppError('Learning module not found.', 404, 'NOT_FOUND');
	return module;
};

const assertFacilityAdminModuleScope = async (module, actor) => {
	if (!isFacilityAdmin(actor?.role)
		|| !(await repository.isModuleInFacilityScope({ moduleId: module.id, facilityId: actor.facility_id }))) {
		throw new AppError('You do not have permission to access this learning module.', 403, 'FORBIDDEN');
	}
};

const assertSystemAdminModuleManagement = (actor) => {
	if (!isSystemAdmin(actor?.role)) {
		throw new AppError('Only system administrators can manage learning modules.', 403, 'FORBIDDEN');
	}
};

const assertMentorAssignmentForModule = async ({ moduleId, mentorId, menteeId }) => {
	if (!(await repository.hasActiveMentorAssignment({ moduleId, mentorId, menteeId }))) {
		throw new AppError('You are not assigned to this mentee for the module thematic area.', 403, 'FORBIDDEN');
	}
};

const listModules = async (filters = {}, actor = {}) => {
	let moduleIds = filters.moduleIds;
	if (isFacilityAdmin(actor.role)) {
		moduleIds = await repository.listModuleIdsForFacility(actor.facility_id);
	} else if (normalizeRole(actor.role) === Role.MENTOR || filters.mentorId) {
		const mentorId = normalizeRole(actor.role) === Role.MENTOR ? actor.id : filters.mentorId;
		const thematicAreaIds = await repository.listActiveMentorThematicAreaIds(mentorId);
		if (thematicAreaIds.length === 0) {
			moduleIds = [];
		} else {
			moduleIds = await repository.listModuleIdsForThematicAreas(thematicAreaIds);
		}
		filters = { ...filters, publishedOnly: true, authorizedOnly: true };
	} else if (normalizeRole(actor.role) === Role.MENTEE) {
		moduleIds = [];
	}
	return repository.listModules({ ...filters, moduleIds });
};

const assertMenteeHasModuleAccess = async ({ menteeId, moduleId }) => {
	const hasAssignedResource = await repository.hasActiveResourceAssignmentForMenteeModule(menteeId, moduleId);
	if (!hasAssignedResource) {
		throw new AppError('Module access has not been granted.', 403, 'FORBIDDEN');
	}
};

const assertModuleAvailableToLearner = async ({ module, role, userId }) => {
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('This learning module is not published and authorized.', 403, 'FORBIDDEN');
	}
	if (normalizeRole(role) === Role.MENTOR) {
		if (!(await repository.hasActiveMentorAssignment({ mentorId: userId, moduleId: module.id }))) {
			throw new AppError('You are not assigned to this module thematic area.', 403, 'FORBIDDEN');
		}
	}
	if (normalizeRole(role) === Role.MENTEE) {
		await assertMenteeHasModuleAccess({ menteeId: userId, moduleId: module.id });
	}
};

const getModule = async (moduleId, actor = {}) => {
	const module = await ensureModule(moduleId);
	if (isFacilityAdmin(actor.role)) {
		await assertFacilityAdminModuleScope(module, actor);
		return module;
	}
	if (!isSystemAdmin(actor.role)) {
		await assertModuleAvailableToLearner({ module, role: actor.role, userId: actorUserId(actor) });
		return repository.getModuleById(moduleId, { learnerVisible: true });
	}
	return module;
};

const createModule = async (payload = {}, actor) => {
	assertSystemAdminModuleManagement(actor);
	if (!payload.title || !String(payload.title).trim()) {
		throw new AppError('title is required.', 400, 'VALIDATION_ERROR');
	}
	return repository.createModule(normalizePublicationPayload({ ...payload, title: String(payload.title).trim() }));
};

const updateModule = async (moduleId, payload = {}, actor) => {
	const previousModule = await ensureModule(moduleId);
	assertSystemAdminModuleManagement(actor);
	if (payload.title !== undefined) {
		const trimmedTitle = String(payload.title).trim();
		if (!trimmedTitle) throw new AppError('title cannot be empty.', 400, 'VALIDATION_ERROR');
		payload = { ...payload, title: trimmedTitle };
	}
	payload = normalizePublicationPayload(payload);
	const module = await repository.updateModule(moduleId, payload);
	if (!isModulePublishedAndAuthorized(previousModule) && isModulePublishedAndAuthorized(module)) {
		await notificationService.publishEventSafely({
			eventType: 'learning.module_access_granted',
			eventKey: `learning-module:${moduleId}:published`,
			referenceType: 'learning_module',
			referenceId: moduleId,
			facilityIds: [module.facility_id].filter(Boolean),
		});
	}
	return module;
};

const deleteModule = async (moduleId, actor) => {
	await ensureModule(moduleId);
	assertSystemAdminModuleManagement(actor);
	return repository.deleteModule(moduleId);
};

const getMyModules = async (menteeId) => {
	// Mentees see only modules containing an individually assigned resource.
	// Thematic-area membership and legacy whole-module progress must not expose
	// the module or its materials.
	return repository.listResourceAssignedModulesForMentee(menteeId);
};

const assertMentorCanAccessMentee = async ({ mentorId, menteeId, moduleId }) => {
	if (!(await repository.hasActiveMentorAssignment({ mentorId, menteeId, moduleId }))) {
		throw new AppError('You are not assigned to this mentee.', 403, 'FORBIDDEN');
	}
};

const assignModuleToMentee = async ({ moduleId, menteeId, actor }) => {
	if (normalizeRole(actor?.role) !== Role.MENTOR) {
		throw new AppError('Mentor role required.', 403, 'FORBIDDEN');
	}
	const module = await ensureModule(moduleId);
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('Only published and authorized modules can be assigned.', 409, 'CONFLICT');
	}
	await assertMentorAssignmentForModule({ moduleId, mentorId: actor.id, menteeId });
	if (!(await repository.isMentee(menteeId))) {
		throw new AppError('Mentee not found.', 404, 'NOT_FOUND');
	}
	return repository.assignModuleToMentee({ moduleId, menteeId, mentorId: actor.id });
};

const revokeModuleAssignment = async ({ moduleId, menteeId, actor }) => {
	if (normalizeRole(actor?.role) !== Role.MENTOR) {
		throw new AppError('Mentor role required.', 403, 'FORBIDDEN');
	}
	await assertMentorAssignmentForModule({ moduleId, mentorId: actor.id, menteeId });
	const revoked = await repository.revokeModuleAssignment({ moduleId, menteeId, mentorId: actor.id });
	if (!revoked) throw new AppError('Active module assignment not found.', 404, 'NOT_FOUND');
	return { revoked: true };
};

const getMenteeModules = async (menteeId, actor = {}) => {
	if (!(await repository.isMentee(menteeId))) throw new AppError('Mentee not found.', 404, 'NOT_FOUND');
	if (isFacilityAdmin(actor.role)) {
		const mentee = await repository.getUserById(menteeId);
		if (!mentee || Number(mentee.facility_id) !== Number(actor.facility_id)) {
			throw new AppError('You do not have permission to access this mentee.', 403, 'FORBIDDEN');
		}
	}
	return repository.listProgressForMentee(menteeId, {
		mentorId: normalizeRole(actor.role) === Role.MENTOR ? actor.id : undefined,
	});
};

const getMyModuleProgress = async ({ menteeId, moduleId, cycleId }) => {
	const module = await ensureModule(moduleId);
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('This learning module is not published and authorized.', 403, 'FORBIDDEN');
	}
	return resourceProgressService.getProgress({ menteeId, module, cycleId });
};

const getResourceProgress = async ({ menteeId, moduleId, cycleId }) => {
	const module = await ensureModule(moduleId);
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('This learning module is not published and authorized.', 403, 'FORBIDDEN');
	}
	return resourceProgressService.getProgress({ menteeId, module, cycleId });
};

const confirmModuleCompletion = async ({ menteeId, moduleId, cycleId }) => {
	const module = await ensureModule(moduleId);
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('This learning module is not published and authorized.', 403, 'FORBIDDEN');
	}
	if (typeof resourceProgressService.confirmProgress !== 'function') {
		throw new AppError('Module completion confirmation dependency is unavailable.', 500, 'SERVICE_UNAVAILABLE');
	}
	return resourceProgressService.confirmProgress({ menteeId, module, cycleId });
};




const resolveThematicContext = async (thematicAreaId, menteeId, cycleId) => {
	const { Assignment, CycleFacility, CycleThematicArea } = require('../models');
	const where = {
		mentee_id: menteeId,
		thematic_area_id: thematicAreaId,
		status: { [Op.in]: ['assigned', 'active'] },
		unassigned_at: null,
		facility_id: { [Op.ne]: null },
		cycle_id: { [Op.ne]: null },
	};
	if (cycleId != null) where.cycle_id = cycleId;
	const assignments = await Assignment.findAll({ where, attributes: ['facility_id', 'cycle_id', 'thematic_area_id'] });
	const pairs = [...new Map(assignments.map((entry) => [`${entry.facility_id}:${entry.cycle_id}:${entry.thematic_area_id}`, entry])).values()];
	const valid = [];
	for (const pair of pairs) {
		const [facility, area] = await Promise.all([
			CycleFacility.findOne({ where: { cycle_id: pair.cycle_id, facility_id: pair.facility_id } }),
			CycleThematicArea.findOne({ where: { cycle_id: pair.cycle_id, thematic_area_id: thematicAreaId } }),
		]);
		if (facility && area) valid.push(pair);
	}
	if (!valid.length) throw new AppError('No valid mentorship context exists for this thematic area and mentee.', 403, 'FORBIDDEN');
	if (valid.length > 1) throw new AppError('Multiple valid mentorship contexts match this thematic area; provide a cycleId.', 400, 'AMBIGUOUS_CYCLE_CONTEXT');
	return valid[0];
};

const assertThematicPostTestEligibility = async ({ quiz, menteeId, context }) => {
	const { LearningModule, Resource, LearningModuleProgress, QuizAttempt } = require('../models');
	const pretest = await QuizAttempt.findOne({ where: {
		quiz_id: quiz.id, mentee_id: menteeId, cycle_id: context.cycle_id,
		assessment_stage: 'PRETEST', status: 'completed',
	} });
	if (!pretest) throw new AppError('Complete the PRETEST before taking the POST_TEST.', 409, 'PRETEST_REQUIRED');
	const modules = await LearningModule.findAll({
		where: { thematic_area_id: quiz.thematic_area_id, is_published: true, is_authorized: true, status: 'published' },
		attributes: ['id'],
	});
	const requiredModules = [];
	for (const module of modules) {
		const count = await Resource.count({ where: { module_id: module.id, is_required: true } });
		if (count > 0) requiredModules.push(module);
	}
	for (const module of requiredModules) {
		const progress = await resourceProgressService.getProgress({ menteeId, module, cycleId: context.cycle_id });
		const confirmed = await LearningModuleProgress.findOne({ where: { mentee_id: menteeId, module_id: module.id, cycle_id: context.cycle_id, status: 'completed' } });
		if (!confirmed || progress.status !== 'completed' || progress.incompleteRequiredResources !== 0) {
			throw new AppError('Complete and confirm all required modules in this thematic area before taking the POST_TEST.', 409, 'REQUIRED_MODULES_INCOMPLETE');
		}
	}
};

const assertQuizEligibility = async ({ quiz, menteeId, cycleId, assessmentStage }) => {
	const stage = assessmentStage || quiz.assessment_stage || null;
	if (quiz.thematic_area_id) {
		if (!quiz.is_published || !quiz.is_authorized) throw new AppError('This quiz is not published and authorized.', 403, 'FORBIDDEN');
		const context = await resolveThematicContext(quiz.thematic_area_id, menteeId, cycleId);
		const { QuizAttempt } = require('../models');
		const completed = await QuizAttempt.findOne({ where: { quiz_id: quiz.id, mentee_id: menteeId, cycle_id: context.cycle_id, assessment_stage: stage, status: 'completed' } });
		if (completed) throw new AppError(`${stage || 'Quiz'} has already been completed for this mentorship cycle.`, 409, 'ATTEMPT_LIMIT_REACHED');
		if (stage === 'POST_TEST') await assertThematicPostTestEligibility({ quiz, menteeId, context });
		return { module: null, cycleId: Number(context.cycle_id), context };
	}
	const module = await ensureModule(quiz.module_id);
	if (!module.is_published || String(module.status).toLowerCase() !== 'published') {
		throw new AppError('This learning module is not published.', 403, 'FORBIDDEN');
	}
	if (!module.is_authorized || !quiz.is_published || !quiz.is_authorized) {
		throw new AppError('This quiz or its module is not published and authorized.', 403, 'FORBIDDEN');
	}
	const resourceProgress = await resourceProgressService.getProgress({ menteeId, module, cycleId });
	const selectedCycleId = resourceProgress.cycleId;
	const moduleAccess = await repository.getModuleProgress({ menteeId, moduleId: module.id, cycleId: selectedCycleId });
	if (!moduleAccess) throw new AppError('Module access has not been granted for this cycle.', 403, 'FORBIDDEN');
	if (resourceProgress.status !== 'completed' || resourceProgress.totalRequiredResources < 1 || resourceProgress.incompleteRequiredResources !== 0 || resourceProgress.completionPercentage !== 100) {
		throw new AppError('Complete all required Resources and confirm module completion for this cycle before taking the quiz.', 409, 'CONFLICT');
	}
	return { module, cycleId: selectedCycleId, context: { cycle_id: selectedCycleId } };
};

const getQuizByModule = async (moduleId, menteeId, cycleId, assessmentStage) => {
	const module = await ensureModule(moduleId);
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('This learning module is not published and authorized.', 403, 'FORBIDDEN');
	}
	const quiz = await repository.getQuizByModule(moduleId);
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	await assertQuizEligibility({ quiz, menteeId, cycleId, assessmentStage });
	return quiz;
};

const getQuizByThematicArea = async (thematicAreaId, actor, cycleId, assessmentStage) => {
	const { ThematicArea } = require('../models');
	if (!await ThematicArea.findByPk(thematicAreaId)) throw new AppError('Thematic area not found.', 404, 'NOT_FOUND');
	const quiz = await repository.getQuizByThematicArea(thematicAreaId);
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	if (!isSystemAdmin(actor?.role)) {
		if (!quiz.is_published || !quiz.is_authorized) throw new AppError('This quiz is not published and authorized.', 403, 'FORBIDDEN');
		if (normalizeRole(actor?.role) === Role.MENTEE) await assertQuizEligibility({ quiz, menteeId: actor.id, cycleId, assessmentStage });
	}
	return quiz;
};

const getQuizByModuleForViewer = async (moduleId, actor, cycleId, assessmentStage) => {
	const module = await ensureModule(moduleId);
	const role = normalizeRole(actor?.role);
	if (role === Role.MENTEE) return getQuizByModule(moduleId, actor.id, cycleId, assessmentStage);
	if (role === Role.FACILITY_ADMIN) await assertFacilityAdminModuleScope(module, actor);
	else if (role === Role.MENTOR) await assertModuleAvailableToLearner({ module, role, userId: actor.id });
	else if (!isSystemAdmin(role)) throw new AppError('You do not have permission to view this quiz.', 403, 'FORBIDDEN');
	const quiz = await repository.getQuizByModule(moduleId);
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	if (!isSystemAdmin(role) && (!quiz.is_published || !quiz.is_authorized)) {
		throw new AppError('This quiz is not published and authorized.', 403, 'FORBIDDEN');
	}
	return quiz;
};

const getQuiz = async (quizId, menteeId, cycleId, assessmentStage) => {
	const quiz = await repository.getQuizById(quizId);
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	await assertQuizEligibility({ quiz, menteeId, cycleId, assessmentStage });
	return repository.getQuizForLearner(quizId);
};

const startQuizAttempt = async ({ quizId, menteeId, cycleId, assessmentStage }) => {
	if (!menteeId) throw new AppError('menteeId is required.', 400, 'VALIDATION_ERROR');
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: false });
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	const eligibility = await assertQuizEligibility({ quiz, menteeId, cycleId, assessmentStage });
	if (!quiz.questions || quiz.questions.length === 0) {
		throw new AppError('This quiz does not have any questions yet.', 409, 'CONFLICT');
	}
	return repository.startQuizAttempt({ quizId, menteeId, cycleId: eligibility.cycleId, assessmentStage: assessmentStage || quiz.assessment_stage });
};

const submitQuiz = async ({ quizId, menteeId, answers, cycleId, assessmentStage }) => {
	if (!menteeId) throw new AppError('menteeId is required.', 400, 'VALIDATION_ERROR');
	if (!Array.isArray(answers) || answers.length === 0) {
		throw new AppError('answers must be a non-empty array.', 400, 'VALIDATION_ERROR');
	}
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: false });
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	const eligibility = await assertQuizEligibility({ quiz, menteeId, cycleId, assessmentStage });
	const result = await repository.submitQuiz({ quizId, menteeId, answers, cycleId: eligibility.cycleId, assessmentStage: assessmentStage || quiz.assessment_stage });
	if ((result.assessmentStage || assessmentStage || quiz.assessment_stage) === 'PRETEST') {
		result.answers = undefined;
	}
	await notificationService.createNotification({
		userId: menteeId,
		type: NotificationType.QUIZ_RESULT_FINALIZED,
		title: 'Quiz result finalized',
		body: `Your quiz result is finalized: ${result.score}/${result.totalPoints} points.`,
		referenceType: 'quiz_attempt',
		referenceId: result.id,
	});
	return result;
};

const listQuizAttempts = async ({ quizId, menteeId }) => repository.listQuizAttempts({ quizId, menteeId });
const getQuizResults = async ({ quizId, menteeId }) => repository.listQuizAttempts({ quizId, menteeId, completedOnly: true });

const assertFacilityAdminQuizScope = async (module, actor) => {
	if (!isSystemAdmin(actor?.role)) {
		throw new AppError('Only Super Admin can manage quiz configuration.', 403, 'FORBIDDEN');
	}
};

const assertCanViewQuizAnswerKey = async ({ quiz, module, actor }) => {
	if (isSystemAdmin(actor?.role)) return;
	if (isFacilityAdmin(actor?.role)) {
		await assertFacilityAdminModuleScope(module, actor);
		return;
	}
	if (normalizeRole(actor?.role) !== Role.MENTOR) {
		throw new AppError('You do not have permission to view quiz questions.', 403, 'FORBIDDEN');
	}
	if (!isModulePublishedAndAuthorized(module) || !quiz.is_published || !quiz.is_authorized) {
		throw new AppError('This quiz or its module is not published and authorized.', 403, 'FORBIDDEN');
	}
	await assertMentorAssignmentForModule({ moduleId: module.id, mentorId: actor.id ?? actor.userId });
};

const getQuizForManagement = async (quizId, actor) => {
	const visibleQuiz = await repository.getQuizById(quizId, { includeCorrectAnswers: false });
	if (!visibleQuiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	const module = visibleQuiz.module_id ? await ensureModule(visibleQuiz.module_id) : null;
	await assertFacilityAdminQuizScope(module, actor);
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: true });
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	return quiz;
};

const createQuiz = async ({ moduleId, createdBy, actor, ...payload }) => {
	if (moduleId && payload.thematicAreaId) throw new AppError('A quiz cannot be owned by both a module and a thematic area.', 400, 'VALIDATION_ERROR');
	const module = moduleId ? await ensureModule(moduleId) : null;
	if (module) await assertFacilityAdminQuizScope(module, actor);
	if (!payload.thematicAreaId && !moduleId) throw new AppError('thematicAreaId is required.', 400, 'VALIDATION_ERROR');
	if (moduleId && !payload.assessmentStage) throw new AppError('assessmentStage is required for legacy module quizzes.', 400, 'VALIDATION_ERROR');
	if (moduleId && payload.assessmentStage && !Object.values(LearningExaminationStage).includes(payload.assessmentStage)) {
		throw new AppError('assessmentStage must be PRETEST or POST_TEST.', 400, 'VALIDATION_ERROR');
	}
	return repository.createQuiz(moduleId, payload, createdBy);
};

const createThematicAreaQuiz = async ({ thematicAreaId, createdBy, actor, ...payload }) => {
	const { ThematicArea } = require('../models');
	const area = await ThematicArea.findByPk(thematicAreaId);
	if (!area) throw new AppError('Thematic area not found.', 404, 'NOT_FOUND');
	if (payload.moduleId) throw new AppError('A thematic-area quiz cannot also be owned by a module.', 400, 'VALIDATION_ERROR');
	await assertFacilityAdminQuizScope(null, actor);
	return repository.createQuiz(null, { ...payload, thematicAreaId }, createdBy);
};

const updateQuiz = async (quizId, payload, actor) => {
	if (payload.title !== undefined && !String(payload.title).trim()) {
		throw new AppError('title is required.', 400, 'VALIDATION_ERROR');
	}
	if (payload.assessmentStage !== undefined
		&& !Object.values(LearningExaminationStage).includes(payload.assessmentStage)) {
		throw new AppError('assessmentStage must be PRETEST or POST_TEST.', 400, 'VALIDATION_ERROR');
	}
	await getQuizForManagement(quizId, actor);
	return repository.updateQuiz(quizId, {
		...payload,
		...(payload.title === undefined ? {} : { title: String(payload.title).trim() }),
	});
};

const listQuizQuestions = async (quizId, actor) => {
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: false });
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	const module = await ensureModule(quiz.module_id);
	const role = normalizeRole(actor?.role);
	if (isSystemAdmin(role)) {
		// System administrators can review quiz questions.
	} else if (isFacilityAdmin(role)) {
		await assertFacilityAdminModuleScope(module, actor);
	} else if (role === Role.MENTOR) {
		// Normal module access is sufficient for question review. Correct answers
		// remain protected by the separate answer-key permission below.
		await assertModuleAvailableToLearner({ module, role, userId: actor.id ?? actor.userId });
	} else {
		throw new AppError('You do not have permission to view quiz questions.', 403, 'FORBIDDEN');
	}
	return repository.listQuizQuestions(quizId);
};

const createQuizQuestion = async (quizId, payload, actor) => {
	await getQuizForManagement(quizId, actor);
	return repository.createQuizQuestion(quizId, payload);
};

const ensureQuestionBelongsToQuiz = async (quizId, questionId) => {
	const question = await repository.getQuizQuestion(questionId);
	if (!question) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	if (Number(question.quiz_id) !== Number(quizId)) throw new AppError('The question does not belong to this quiz.', 400, 'VALIDATION_ERROR');
	return question;
};

const updateQuizQuestion = async (quizId, questionId, payload, actor) => {
	await getQuizForManagement(quizId, actor);
	await ensureQuestionBelongsToQuiz(quizId, questionId);
	return repository.updateQuizQuestion(questionId, payload);
};

const deleteQuizQuestion = async (quizId, questionId, actor) => {
	await getQuizForManagement(quizId, actor);
	await ensureQuestionBelongsToQuiz(quizId, questionId);
	return repository.deleteQuizQuestion(questionId);
};

const createQuestionOption = async (questionId, payload, actor) => {
	const question = await repository.getQuizQuestion(questionId);
	if (!question) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	await getQuizForManagement(question.quiz_id, actor);
	return repository.createQuestionOption(questionId, payload);
};

const ensureOptionBelongsToQuestion = async (questionId, optionId) => {
	const question = await repository.getQuizQuestion(questionId);
	if (!question) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	const option = (question.options || []).find((entry) => Number(entry.id) === Number(optionId));
	if (!option) throw new AppError('Question option not found.', 404, 'NOT_FOUND');
	return option;
};

const updateQuestionOption = async (questionId, optionId, payload, actor) => {
	const question = await repository.getQuizQuestion(questionId);
	if (!question) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	await getQuizForManagement(question.quiz_id, actor);
	await ensureOptionBelongsToQuestion(questionId, optionId);
	return repository.updateQuestionOption(optionId, payload);
};

const deleteQuestionOption = async (questionId, optionId, actor) => {
	const question = await repository.getQuizQuestion(questionId);
	if (!question) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	await getQuizForManagement(question.quiz_id, actor);
	await ensureOptionBelongsToQuestion(questionId, optionId);
	return repository.deleteQuestionOption(optionId);
};

const getQuizAnswerKey = async ({ quizId, actor }) => {
	const visibleQuiz = await repository.getQuizById(quizId, { includeCorrectAnswers: false });
	if (!visibleQuiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	const module = await ensureModule(visibleQuiz.module_id);
	await assertCanViewQuizAnswerKey({ quiz: visibleQuiz, module, actor });
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: true });
	return {
		quizId: quiz.id,
		moduleId: module.id,
		title: quiz.title,
		questions: (quiz.questions || []).map((question) => ({
			id: question.id,
			prompt: question.prompt,
			explanation: question.explanation || null,
			points: question.points,
			options: (question.options || []).map((option) => ({
				id: option.id,
				text: option.text,
				label: ['A', 'B', 'C', 'D'][Number(option.order_number)] || null,
				orderNumber: option.order_number ?? 0,
				isCorrect: Boolean(option.is_correct),
			})),
		})),
	};
};

module.exports = {
	listModules,
	getModule,
	createModule,
	updateModule,
	deleteModule,
	createQuiz,
	createThematicAreaQuiz,
	updateQuiz,
	assertMentorCanAccessMentee,
	assignModuleToMentee,
	revokeModuleAssignment,
	getMenteeModules,
	getMyModules,
	getMyModuleProgress,
	getResourceProgress,
	confirmModuleCompletion,
	getQuizByModule,
	getQuizByThematicArea,
	getQuizByModuleForViewer,
	getQuiz,
	startQuizAttempt,
	submitQuiz,
	listQuizAttempts,
	getQuizResults,
	listQuizQuestions,
	createQuizQuestion,
	updateQuizQuestion,
	deleteQuizQuestion,
	createQuestionOption,
	updateQuestionOption,
	deleteQuestionOption,
	getQuizAnswerKey,
};
