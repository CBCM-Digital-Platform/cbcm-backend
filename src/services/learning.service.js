const repository = require('../repositories/learning.repository');
const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const LearningPermission = require('../enums/learning-permission.enum');
const notificationService = require('./notifications.service');
const NotificationType = require('../enums/notification-type.enum');

const normalizeRole = (role) => String(role || '').toLowerCase();
const isSystemAdmin = (role) => normalizeRole(role) === Role.ADMIN;
const isFacilityAdmin = (role) => normalizeRole(role) === Role.FACILITY_ADMIN;
const isLearningManager = (role) => isSystemAdmin(role) || isFacilityAdmin(role);
const isModulePublishedAndAuthorized = (module) => (
	Boolean(module.is_published)
	&& Boolean(module.is_authorized)
	&& String(module.status).toLowerCase() === 'published'
);

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

const assertModuleManagementScope = async (module, actor) => {
	if (isSystemAdmin(actor?.role)) return;
	await assertFacilityAdminModuleScope(module, actor);
};

const assertMentorPermission = async ({ moduleId, mentorId, permission }) => {
	if (!(await repository.hasModuleMentorPermission({ moduleId, mentorId, permission }))) {
		throw new AppError('You do not have the required learning permission for this module.', 403, 'FORBIDDEN');
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
	} else if (normalizeRole(actor.role) === Role.MENTOR) {
		const grantedIds = await repository.listMentorModuleIds(actor.id);
		const eligibleIds = await Promise.all(grantedIds.map(async (moduleId) => (
			await repository.hasActiveMentorAssignment({ mentorId: actor.id, moduleId }) ? moduleId : null
		)));
		moduleIds = eligibleIds.filter(Boolean);
		filters = { ...filters, publishedOnly: true, authorizedOnly: true };
	} else if (normalizeRole(actor.role) === Role.MENTEE) {
		moduleIds = [];
	}
	return repository.listModules({ ...filters, moduleIds });
};

const assertMenteeHasModuleAccess = async ({ menteeId, moduleId }) => {
	if (!(await repository.getModuleProgress({ menteeId, moduleId }))) {
		throw new AppError('Module access has not been granted.', 403, 'FORBIDDEN');
	}
};

const assertModuleAvailableToLearner = async ({ module, role, userId }) => {
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('This learning module is not published and authorized.', 403, 'FORBIDDEN');
	}
	if (normalizeRole(role) === Role.MENTOR) {
		await assertMentorPermission({
			moduleId: module.id,
			mentorId: userId,
			permission: LearningPermission.RESOURCES_VIEW,
		});
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
		await assertModuleAvailableToLearner({ module, role: actor.role, userId: actor.id });
		return repository.getModuleById(moduleId, { learnerVisible: true });
	}
	return module;
};

const createModule = async (payload = {}) => {
	if (!payload.title || !String(payload.title).trim()) {
		throw new AppError('title is required.', 400, 'VALIDATION_ERROR');
	}
	return repository.createModule({ ...payload, title: String(payload.title).trim() });
};

const updateModule = async (moduleId, payload = {}, actor) => {
	const previousModule = await ensureModule(moduleId);
	await assertModuleManagementScope(previousModule, actor);
	if (isFacilityAdmin(actor.role)
		&& payload.thematicAreaId !== undefined
		&& !(await repository.isThematicAreaInFacilityScope({
			thematicAreaId: payload.thematicAreaId,
			facilityId: actor.facility_id,
		}))) {
		throw new AppError('The thematic area is outside your facility scope.', 403, 'FORBIDDEN');
	}
	if (payload.title !== undefined) {
		const trimmedTitle = String(payload.title).trim();
		if (!trimmedTitle) {
			throw new AppError('title cannot be empty.', 400, 'VALIDATION_ERROR');
		}
		payload = { ...payload, title: trimmedTitle };
	}
	const module = await repository.updateModule(moduleId, payload);
	if (!isModulePublishedAndAuthorized(previousModule) && isModulePublishedAndAuthorized(module)) {
		const accesses = await repository.listModuleProgress(moduleId);
		await notificationService.createNotifications({
			userIds: accesses.map((access) => access.mentee_id),
			type: NotificationType.LEARNING_MODULE_PUBLISHED,
			title: 'Learning module published',
			body: `${module.title} is now available.`,
			referenceType: 'learning_module',
			referenceId: module.id,
		});
	}
	return module;
};

const deleteModule = async (moduleId, actor) => {
	const module = await ensureModule(moduleId);
	await assertModuleManagementScope(module, actor);
	return repository.deleteModule(moduleId);
};

const listContents = async (moduleId, actor = {}) => {
	const module = await ensureModule(moduleId);
	if (isFacilityAdmin(actor.role)) await assertFacilityAdminModuleScope(module, actor);
	else if (!isSystemAdmin(actor.role)) {
		await assertModuleAvailableToLearner({ module, role: actor.role, userId: actor.id });
	}
	return repository.listContents(moduleId, { learnerVisible: !isLearningManager(actor.role) });
};

const getContent = async (contentId, actor = {}) => {
	const content = await repository.getContentById(contentId);
	if (!content) throw new AppError('Learning content not found.', 404, 'NOT_FOUND');
	const module = await ensureModule(content.module_id);
	if (isFacilityAdmin(actor.role)) {
		await assertFacilityAdminModuleScope(module, actor);
	} else if (!isSystemAdmin(actor.role) && actor.role) {
		await assertModuleAvailableToLearner({ module, role: actor.role, userId: actor.id });
		if (!content.is_published || !content.is_authorized) {
			throw new AppError('This learning content is not published and authorized.', 403, 'FORBIDDEN');
		}
	}
	return content;
};

const createContent = async ({ moduleId, title, type, contentText, contentUrl, orderNumber, isRequired, isPublished, isAuthorized, durationMinutes, createdBy, actor }) => {
	if (!moduleId) throw new AppError('moduleId is required.', 400, 'VALIDATION_ERROR');
	if (!title || !String(title).trim()) throw new AppError('title is required.', 400, 'VALIDATION_ERROR');
	const module = await ensureModule(moduleId);
	await assertModuleManagementScope(module, actor);
	return repository.createContent({
		moduleId,
		title: String(title).trim(),
		type,
		contentText,
		contentUrl,
		orderNumber,
		isRequired,
		isPublished,
		isAuthorized,
		durationMinutes,
		createdBy,
	});
};

const updateContent = async (moduleId, contentId, payload = {}, actor) => {
	const module = await ensureModule(moduleId);
	await assertModuleManagementScope(module, actor);
	if (payload.title !== undefined && (!payload.title || !String(payload.title).trim())) {
		throw new AppError('title cannot be empty.', 400, 'VALIDATION_ERROR');
	}
	return repository.updateContent(moduleId, contentId, payload);
};

const deleteContent = async (moduleId, contentId, actor) => {
	const content = await getContent(contentId, actor);
	if (Number(content.module_id) !== Number(moduleId)) throw new AppError('Learning content not found.', 404, 'NOT_FOUND');
	return repository.deleteContent(moduleId, contentId);
};

const assertGrantorModuleScope = async ({ module, actor }) => {
	await assertFacilityAdminModuleScope(module, actor);
};

const assertMentorEligibleForModule = async ({ mentorId, moduleId }) => {
	if (!(await repository.isMentor(mentorId))) {
		throw new AppError('Permissions can only be granted to a mentor.', 400, 'VALIDATION_ERROR');
	}
	if (!(await repository.hasActiveMentorAssignment({ mentorId, moduleId }))) {
		throw new AppError('The mentor must have an active assignment for this module thematic area.', 409, 'CONFLICT');
	}
};

const grantMentorModuleAccess = async ({ mentorId, moduleId, actor }) => {
	if (!(await repository.isMentor(mentorId))) throw new AppError('Access can only be granted to a mentor.', 400, 'VALIDATION_ERROR');
	const module = await ensureModule(moduleId);
	await assertGrantorModuleScope({ module, actor });
	await assertMentorEligibleForModule({ mentorId, moduleId });
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('Only published and authorized modules can be assigned to mentors.', 409, 'CONFLICT');
	}
	return repository.grantMentorModuleAccess({ moduleId, mentorId, grantedBy: actor.id });
};

const getModuleMentorAccess = async (moduleId, actor) => {
	const module = await ensureModule(moduleId);
	await assertGrantorModuleScope({ module, actor });
	return repository.listModuleMentorAccess(moduleId);
};

const revokeModuleMentorAccess = async ({ mentorId, moduleId, actor }) => {
	const module = await ensureModule(moduleId);
	await assertGrantorModuleScope({ module, actor });
	if (!(await repository.isMentor(mentorId))) throw new AppError('Mentor not found.', 404, 'NOT_FOUND');
	return repository.revokeModuleMentorAccess({ mentorId, moduleId, revokedBy: actor.id });
};

const listModuleMentorPermissions = async (moduleId, actor) => {
	const module = await ensureModule(moduleId);
	await assertGrantorModuleScope({ module, actor });
	return repository.listModuleMentorPermissions(moduleId);
};

const grantModuleMentorPermission = async ({ mentorId, moduleId, permission, actor }) => {
	const module = await ensureModule(moduleId);
	await assertGrantorModuleScope({ module, actor });
	await assertMentorEligibleForModule({ mentorId, moduleId });
	if (!Object.values(LearningPermission).includes(permission)) {
		throw new AppError('Unsupported learning permission.', 400, 'VALIDATION_ERROR');
	}
	return repository.grantModuleMentorPermission({
		moduleId,
		mentorId,
		permission,
		grantedBy: actor.id,
	});
};

const revokeModuleMentorPermission = async ({ mentorId, moduleId, permission, actor }) => {
	const module = await ensureModule(moduleId);
	await assertGrantorModuleScope({ module, actor });
	if (!Object.values(LearningPermission).includes(permission)) {
		throw new AppError('Unsupported learning permission.', 400, 'VALIDATION_ERROR');
	}
	if (!(await repository.isMentor(mentorId))) throw new AppError('Mentor not found.', 404, 'NOT_FOUND');
	return repository.revokeModuleMentorPermission({
		mentorId,
		moduleId,
		permission,
		revokedBy: actor.id,
	});
};

const grantModuleAccess = async ({ menteeId, moduleId, mentorId }) => {
	if (!menteeId) throw new AppError('menteeId is required.', 400, 'VALIDATION_ERROR');
	if (!(await repository.isMentee(menteeId))) throw new AppError('Access can only be granted to a mentee.', 400, 'VALIDATION_ERROR');
	if (!(await repository.isMentor(mentorId))) throw new AppError('Only mentors can grant mentee access.', 403, 'FORBIDDEN');
	const module = await ensureModule(moduleId);
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('Only published and authorized modules can be assigned.', 409, 'CONFLICT');
	}
	await assertMentorCanAccessMentee({ mentorId, menteeId, moduleId });
	await assertMentorPermission({ mentorId, moduleId, permission: LearningPermission.RESOURCES_VIEW });
	await assertMentorPermission({ mentorId, moduleId, permission: LearningPermission.MATERIALS_ASSIGN });
	const existingAccess = await repository.getModuleProgress({ menteeId, moduleId });
	const progress = await repository.grantModuleAccess({ menteeId, moduleId, mentorId });
	if (!existingAccess) {
		await notificationService.createNotification({
			userId: menteeId,
			type: NotificationType.LEARNING_MODULE_ASSIGNED,
			title: 'Learning module assigned',
			body: `You have been assigned the learning module "${module.title}".`,
			referenceType: 'learning_module',
			referenceId: module.id,
		});
	}
	return progress;
};

const getMyModules = async (menteeId) => repository.listProgressForMentee(menteeId);

const assertMentorCanAccessMentee = async ({ mentorId, menteeId, moduleId }) => {
	if (!(await repository.hasActiveMentorAssignment({ mentorId, menteeId, moduleId }))) {
		throw new AppError('You are not assigned to this mentee.', 403, 'FORBIDDEN');
	}
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

const getModuleAccess = async (moduleId, actor) => {
	const module = await ensureModule(moduleId);
	if (isFacilityAdmin(actor?.role)) await assertFacilityAdminModuleScope(module, actor);
	return repository.listModuleProgress(moduleId);
};

const revokeModuleAccess = async ({ menteeId, moduleId, mentorId, actor }) => {
	const module = await ensureModule(moduleId);
	if (isFacilityAdmin(actor?.role)) await assertFacilityAdminModuleScope(module, actor);
	if (mentorId) {
		await assertMentorCanAccessMentee({ mentorId, menteeId, moduleId });
		await assertMentorPermission({ mentorId, moduleId, permission: LearningPermission.RESOURCES_VIEW });
		await assertMentorPermission({ mentorId, moduleId, permission: LearningPermission.MATERIALS_ASSIGN });
	}
	return repository.removeModuleAccess({ menteeId, moduleId, mentorId });
};

const getMyModuleProgress = async ({ menteeId, moduleId }) => {
	const module = await ensureModule(moduleId);
	await assertModuleAvailableToLearner({ module, role: Role.MENTEE, userId: menteeId });
	const progress = await repository.getModuleProgress({ menteeId, moduleId });
	if (!progress) throw new AppError('Progress record not found.', 404, 'NOT_FOUND');
	return progress;
};

const getContentProgress = async ({ menteeId, moduleId }) => {
	const module = await ensureModule(moduleId);
	await assertModuleAvailableToLearner({ module, role: Role.MENTEE, userId: menteeId });
	const [contents, progress] = await Promise.all([
		repository.listContents(moduleId, { learnerVisible: true }),
		repository.listProgressForMenteeInModule({ menteeId, moduleId }),
	]);
	const completedIds = new Set(progress.map((record) => Number(record.content_id)));
	return contents.map((content) => ({
		id: content.id,
		title: content.title,
		isRequired: Boolean(content.is_required),
		completed: completedIds.has(Number(content.id)),
		completedAt: progress.find((record) => Number(record.content_id) === Number(content.id))?.completed_at || null,
	}));
};

const completeContent = async ({ menteeId, moduleId, contentId }) => {
	const module = await ensureModule(moduleId);
	await assertModuleAvailableToLearner({ module, role: Role.MENTEE, userId: menteeId });
	const content = await getContent(contentId, { role: Role.MENTEE, userId: menteeId });
	if (Number(content.module_id) !== Number(moduleId)) {
		throw new AppError('The requested content does not belong to this module.', 400, 'VALIDATION_ERROR');
	}
	const { moduleProgress } = await repository.completeContentAndUpdateProgress({ menteeId, moduleId, contentId });
	return moduleProgress;
};

const confirmModuleCompletion = async ({ menteeId, moduleId }) => {
	const module = await ensureModule(moduleId);
	await assertModuleAvailableToLearner({ module, role: Role.MENTEE, userId: menteeId });
	const requiredContents = await repository.listRequiredContents(moduleId);
	const completedRequired = await repository.countCompletedRequiredContents({ menteeId, moduleId });
	const progress = await repository.getModuleProgress({ menteeId, moduleId });
	if (!progress) throw new AppError('Module access has not been granted.', 403, 'FORBIDDEN');
	if (completedRequired !== requiredContents.length) {
		throw new AppError('Complete all required learning content before confirming the module.', 409, 'CONFLICT');
	}
	return progress.update({
		status: 'completed',
		completion_percentage: 100,
		last_accessed_at: new Date(),
		completed_at: new Date(),
	});
};

const assertQuizEligibility = async ({ quiz, menteeId }) => {
	const module = await ensureModule(quiz.module_id);
	if (!module.is_published || String(module.status).toLowerCase() !== 'published') {
		throw new AppError('This learning module is not published.', 403, 'FORBIDDEN');
	}
	if (!module.is_authorized || !quiz.is_published || !quiz.is_authorized) {
		throw new AppError('This quiz or its module is not published and authorized.', 403, 'FORBIDDEN');
	}
	const progress = await repository.getModuleProgress({ menteeId, moduleId: module.id });
	if (!progress) throw new AppError('Module access has not been granted.', 403, 'FORBIDDEN');
	const requiredContents = await repository.listRequiredContents(module.id);
	const completedRequired = await repository.countCompletedRequiredContents({ menteeId, moduleId: module.id });
	if (completedRequired !== requiredContents.length || progress.status !== 'completed') {
		throw new AppError('Complete required content and confirm module completion before taking the quiz.', 409, 'CONFLICT');
	}
	return module;
};

const getQuizByModule = async (moduleId, menteeId) => {
	const module = await ensureModule(moduleId);
	await assertModuleAvailableToLearner({ module, role: Role.MENTEE, userId: menteeId });
	const quiz = await repository.getQuizByModule(moduleId);
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	await assertQuizEligibility({ quiz, menteeId });
	return quiz;
};

const getQuiz = async (quizId, menteeId) => {
	const quiz = await repository.getQuizById(quizId);
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	await assertQuizEligibility({ quiz, menteeId });
	return repository.getQuizForLearner(quizId);
};

const startQuizAttempt = async ({ quizId, menteeId }) => {
	if (!menteeId) throw new AppError('menteeId is required.', 400, 'VALIDATION_ERROR');
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: false });
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	await assertQuizEligibility({ quiz, menteeId });
	return repository.startQuizAttempt({ quizId, menteeId });
};

const submitQuiz = async ({ quizId, menteeId, answers }) => {
	if (!menteeId) throw new AppError('menteeId is required.', 400, 'VALIDATION_ERROR');
	if (!Array.isArray(answers) || answers.length === 0) {
		throw new AppError('answers must be a non-empty array.', 400, 'VALIDATION_ERROR');
	}
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: false });
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	await assertQuizEligibility({ quiz, menteeId });
	const result = await repository.submitQuiz({ quizId, menteeId, answers });
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

const getQuizForManagement = async (quizId, actor) => {
	if (!isFacilityAdmin(actor?.role)) {
		throw new AppError('Only facility administrators can manage quiz configuration.', 403, 'FORBIDDEN');
	}
	const visibleQuiz = await repository.getQuizById(quizId, { includeCorrectAnswers: false });
	if (!visibleQuiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	const module = await ensureModule(visibleQuiz.module_id);
	await assertFacilityAdminModuleScope(module, actor);
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: true });
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	return quiz;
};

const createQuiz = async ({ moduleId, createdBy, actor, ...payload }) => {
	const module = await ensureModule(moduleId);
	await assertFacilityAdminModuleScope(module, actor);
	return repository.createQuiz(moduleId, payload, createdBy);
};

const updateQuiz = async (quizId, payload, actor) => {
	if (payload.title !== undefined && !String(payload.title).trim()) {
		throw new AppError('title is required.', 400, 'VALIDATION_ERROR');
	}
	await getQuizForManagement(quizId, actor);
	return repository.updateQuiz(quizId, {
		...payload,
		...(payload.title === undefined ? {} : { title: String(payload.title).trim() }),
	});
};

const listQuizQuestions = async (quizId, actor) => {
	await getQuizForManagement(quizId, actor);
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
	if (!isFacilityAdmin(actor?.role) && normalizeRole(actor?.role) !== Role.MENTOR) {
		throw new AppError('You do not have permission to view quiz answer keys.', 403, 'FORBIDDEN');
	}
	const visibleQuiz = await repository.getQuizById(quizId, { includeCorrectAnswers: false });
	if (!visibleQuiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	const module = await ensureModule(visibleQuiz.module_id);
	if (isFacilityAdmin(actor.role)) {
		await assertFacilityAdminModuleScope(module, actor);
	} else {
		if (!isModulePublishedAndAuthorized(module) || !visibleQuiz.is_published || !visibleQuiz.is_authorized) {
			throw new AppError('This quiz or its module is not published and authorized.', 403, 'FORBIDDEN');
		}
		await assertMentorAssignmentForModule({ moduleId: module.id, mentorId: actor.id });
		await assertMentorPermission({
			moduleId: module.id,
			mentorId: actor.id,
			permission: LearningPermission.QUIZ_ANSWER_KEY_VIEW,
		});
	}
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
	updateQuiz,
	listContents,
	getContent,
	createContent,
	updateContent,
	deleteContent,
	grantModuleAccess,
	assertMentorCanAccessMentee,
	grantMentorModuleAccess,
	getModuleMentorAccess,
	revokeModuleMentorAccess,
	listModuleMentorPermissions,
	grantModuleMentorPermission,
	revokeModuleMentorPermission,
	getMenteeModules,
	getModuleAccess,
	revokeModuleAccess,
	getMyModules,
	getMyModuleProgress,
	getContentProgress,
	completeContent,
	confirmModuleCompletion,
	getQuizByModule,
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
