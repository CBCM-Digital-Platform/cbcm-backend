const repository = require('../repositories/learning.repository');
const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const notificationService = require('./notifications.service');
const NotificationType = require('../enums/notification-type.enum');

const isLearningAdmin = (role) => [Role.ADMIN, Role.FACILITY_ADMIN].includes(String(role || '').toLowerCase());
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

const listModules = async (filters = {}) => {
	if (filters.mentorId) {
		const moduleIds = await repository.listMentorModuleIds(filters.mentorId);
		return repository.listModules({ ...filters, moduleIds });
	}
	return repository.listModules(filters);
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
	if (String(role || '').toLowerCase() === Role.MENTOR
		&& !(await repository.hasModuleMentorAccess({ mentorId: userId, moduleId: module.id }))) {
		throw new AppError('This learning module has not been assigned to you.', 403, 'FORBIDDEN');
	}
	if (String(role || '').toLowerCase() === Role.MENTEE) {
		await assertMenteeHasModuleAccess({ menteeId: userId, moduleId: module.id });
	}
};

const getModule = async (moduleId, { role, userId } = {}) => {
	const module = await ensureModule(moduleId);
	if (!isLearningAdmin(role)) {
		await assertModuleAvailableToLearner({ module, role, userId });
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

const updateModule = async (moduleId, payload = {}) => {
	const previousModule = await ensureModule(moduleId);
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

const deleteModule = async (moduleId) => {
	await ensureModule(moduleId);
	return repository.deleteModule(moduleId);
};

const listContents = async (moduleId, { role, userId } = {}) => {
	const module = await ensureModule(moduleId);
	if (!isLearningAdmin(role)) await assertModuleAvailableToLearner({ module, role, userId });
	return repository.listContents(moduleId, { learnerVisible: !isLearningAdmin(role) });
};

const getContent = async (contentId, { role, userId } = {}) => {
	const content = await repository.getContentById(contentId);
	if (!content) throw new AppError('Learning content not found.', 404, 'NOT_FOUND');
	const module = await ensureModule(content.module_id);
	if (role && !isLearningAdmin(role)) {
		await assertModuleAvailableToLearner({ module, role, userId });
		if (!content.is_published || !content.is_authorized) {
			throw new AppError('This learning content is not published and authorized.', 403, 'FORBIDDEN');
		}
	}
	return content;
};

const createContent = async ({ moduleId, title, type, contentText, contentUrl, orderNumber, isRequired, isPublished, isAuthorized, durationMinutes, createdBy }) => {
	if (!moduleId) throw new AppError('moduleId is required.', 400, 'VALIDATION_ERROR');
	if (!title || !String(title).trim()) throw new AppError('title is required.', 400, 'VALIDATION_ERROR');
	await ensureModule(moduleId);
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

const updateContent = async (moduleId, contentId, payload = {}) => {
	if (payload.title !== undefined && (!payload.title || !String(payload.title).trim())) {
		throw new AppError('title cannot be empty.', 400, 'VALIDATION_ERROR');
	}
	return repository.updateContent(moduleId, contentId, payload);
};

const deleteContent = async (moduleId, contentId) => {
	const content = await getContent(contentId);
	if (Number(content.module_id) !== Number(moduleId)) throw new AppError('Learning content not found.', 404, 'NOT_FOUND');
	return repository.deleteContent(moduleId, contentId);
};

const grantMentorModuleAccess = async ({ mentorId, moduleId, grantedBy }) => {
	if (!(await repository.isLearningAdmin(grantedBy))) {
		throw new AppError('Only learning administrators can grant modules to mentors.', 403, 'FORBIDDEN');
	}
	if (!(await repository.isMentor(mentorId))) throw new AppError('Access can only be granted to a mentor.', 400, 'VALIDATION_ERROR');
	const module = await ensureModule(moduleId);
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('Only published and authorized modules can be assigned to mentors.', 409, 'CONFLICT');
	}
	return repository.grantMentorModuleAccess({ moduleId, mentorId, grantedBy });
};

const getModuleMentorAccess = async (moduleId) => {
	await ensureModule(moduleId);
	return repository.listModuleMentorAccess(moduleId);
};

const revokeModuleMentorAccess = async ({ mentorId, moduleId }) => {
	await ensureModule(moduleId);
	if (!(await repository.isMentor(mentorId))) throw new AppError('Mentor not found.', 404, 'NOT_FOUND');
	return repository.revokeModuleMentorAccess({ mentorId, moduleId });
};

const grantModuleAccess = async ({ menteeId, moduleId, mentorId }) => {
	if (!menteeId) throw new AppError('menteeId is required.', 400, 'VALIDATION_ERROR');
	if (!(await repository.isMentee(menteeId))) throw new AppError('Access can only be granted to a mentee.', 400, 'VALIDATION_ERROR');
	if (!(await repository.isMentor(mentorId))) throw new AppError('Only mentors can grant mentee access.', 403, 'FORBIDDEN');
	const module = await ensureModule(moduleId);
	if (!isModulePublishedAndAuthorized(module)) {
		throw new AppError('Only published and authorized modules can be assigned.', 409, 'CONFLICT');
	}
	await assertMentorCanAccessMentee({ mentorId, menteeId });
	if (!(await repository.hasModuleMentorAccess({ mentorId, moduleId }))) {
		throw new AppError('This learning module has not been assigned to you.', 403, 'FORBIDDEN');
	}
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

const assertMentorCanAccessMentee = async ({ mentorId, menteeId }) => {
	if (!(await repository.hasActiveMentorAssignment({ mentorId, menteeId }))) {
		throw new AppError('You are not assigned to this mentee.', 403, 'FORBIDDEN');
	}
};

const getMenteeModules = async (menteeId, mentorId) => {
	if (!(await repository.isMentee(menteeId))) throw new AppError('Mentee not found.', 404, 'NOT_FOUND');
	return repository.listProgressForMentee(menteeId, { mentorId });
};

const getModuleAccess = async (moduleId) => {
	await ensureModule(moduleId);
	return repository.listModuleProgress(moduleId);
};

const revokeModuleAccess = async ({ menteeId, moduleId, mentorId }) => {
	await ensureModule(moduleId);
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

const getQuizForManagement = async (quizId) => {
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: true });
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	return quiz;
};

const createQuiz = async ({ moduleId, createdBy, ...payload }) => {
	await ensureModule(moduleId);
	return repository.createQuiz(moduleId, payload, createdBy);
};

const updateQuiz = async (quizId, payload) => {
	if (payload.title !== undefined && !String(payload.title).trim()) {
		throw new AppError('title is required.', 400, 'VALIDATION_ERROR');
	}
	return repository.updateQuiz(quizId, {
		...payload,
		...(payload.title === undefined ? {} : { title: String(payload.title).trim() }),
	});
};

const listQuizQuestions = async (quizId) => {
	await getQuizForManagement(quizId);
	return repository.listQuizQuestions(quizId);
};

const createQuizQuestion = async (quizId, payload) => {
	await getQuizForManagement(quizId);
	return repository.createQuizQuestion(quizId, payload);
};

const ensureQuestionBelongsToQuiz = async (quizId, questionId) => {
	const question = await repository.getQuizQuestion(questionId);
	if (!question) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	if (Number(question.quiz_id) !== Number(quizId)) throw new AppError('The question does not belong to this quiz.', 400, 'VALIDATION_ERROR');
	return question;
};

const updateQuizQuestion = async (quizId, questionId, payload) => {
	await ensureQuestionBelongsToQuiz(quizId, questionId);
	return repository.updateQuizQuestion(questionId, payload);
};

const deleteQuizQuestion = async (quizId, questionId) => {
	await ensureQuestionBelongsToQuiz(quizId, questionId);
	return repository.deleteQuizQuestion(questionId);
};

const createQuestionOption = async (questionId, payload) => {
	if (!(await repository.getQuizQuestion(questionId))) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	return repository.createQuestionOption(questionId, payload);
};

const ensureOptionBelongsToQuestion = async (questionId, optionId) => {
	const question = await repository.getQuizQuestion(questionId);
	if (!question) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	const option = (question.options || []).find((entry) => Number(entry.id) === Number(optionId));
	if (!option) throw new AppError('Question option not found.', 404, 'NOT_FOUND');
	return option;
};

const updateQuestionOption = async (questionId, optionId, payload) => {
	await ensureOptionBelongsToQuestion(questionId, optionId);
	return repository.updateQuestionOption(optionId, payload);
};

const deleteQuestionOption = async (questionId, optionId) => {
	await ensureOptionBelongsToQuestion(questionId, optionId);
	return repository.deleteQuestionOption(optionId);
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
};
