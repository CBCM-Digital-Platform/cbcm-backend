const repository = require('../repositories/learning.repository');
const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const LearningPermission = require('../enums/learning-permission.enum');
const { SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const notificationService = require('./notifications.service');
const NotificationType = require('../enums/notification-type.enum');
const storage = require('../providers/storage.provider');

const normalizeRole = (role) => String(role || '').toLowerCase();
const isSystemAdmin = (role) => SYSTEM_ADMIN_ROLES.includes(normalizeRole(role));
const isFacilityAdmin = (role) => normalizeRole(role) === Role.FACILITY_ADMIN;
const isLearningManager = (role) => isSystemAdmin(role) || isFacilityAdmin(role);
const isModulePublishedAndAuthorized = (module) => (
	Boolean(module.is_published)
	&& Boolean(module.is_authorized)
	&& String(module.status).toLowerCase() === 'published'
);
const actorUserId = (actor = {}) => actor.id ?? actor.userId;

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

const assertSystemAdminModuleManagement = (actor) => {
	if (!isSystemAdmin(actor?.role)) {
		throw new AppError('Only system administrators can manage learning modules.', 403, 'FORBIDDEN');
	}
};

const assertMentorPermission = async ({ moduleId, mentorId, permission }) => {
	const permitted = await repository.hasModuleMentorPermission({ moduleId, mentorId, permission });
	if (!permitted) {
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
	} else if (normalizeRole(actor.role) === Role.MENTOR || filters.mentorId) {
		const mentorId = normalizeRole(actor.role) === Role.MENTOR ? actor.id : filters.mentorId;
		const grantedIds = await repository.listMentorModuleIds(mentorId);
		let eligibleIds = grantedIds;
		if (normalizeRole(actor.role) === Role.MENTOR) {
			eligibleIds = (await Promise.all(grantedIds.map(async (moduleId) => (
				await repository.hasActiveMentorAssignment({ mentorId, moduleId }) ? moduleId : null
			)))).filter(Boolean);
		}
		moduleIds = eligibleIds;
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
		if (!(await repository.hasModuleMentorAccess({ mentorId: userId, moduleId: module.id }))) {
			throw new AppError('You do not have access to this learning module.', 403, 'FORBIDDEN');
		}
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
	return repository.createModule({ ...payload, title: String(payload.title).trim() });
};

const updateModule = async (moduleId, payload = {}, actor) => {
	const previousModule = await ensureModule(moduleId);
	assertSystemAdminModuleManagement(actor);
	if (payload.title !== undefined) {
		const trimmedTitle = String(payload.title).trim();
		if (!trimmedTitle) {
			throw new AppError('title cannot be empty.', 400, 'VALIDATION_ERROR');
		}
		payload = { ...payload, title: trimmedTitle };
	}
	const module = await repository.updateModule(moduleId, payload);
	return module;
};

const deleteModule = async (moduleId, actor) => {
	const module = await ensureModule(moduleId);
	assertSystemAdminModuleManagement(actor);
	return repository.deleteModule(moduleId);
};

const listContents = async (moduleId, actor = {}) => {
	const module = await ensureModule(moduleId);
	if (isFacilityAdmin(actor.role)) await assertFacilityAdminModuleScope(module, actor);
	else if (!isSystemAdmin(actor.role)) {
		await assertModuleAvailableToLearner({ module, role: actor.role, userId: actorUserId(actor) });
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
		await assertModuleAvailableToLearner({ module, role: actor.role, userId: actorUserId(actor) });
		if (!content.is_published || !content.is_authorized) {
			throw new AppError('This learning content is not published and authorized.', 403, 'FORBIDDEN');
		}
	}
	return content;
};

const openContentFile = async (moduleId, contentId, actor = {}) => {
	const content = await getContent(contentId, actor);
	if (Number(content.module_id) !== Number(moduleId)) {
		throw new AppError('Learning content not found.', 404, 'NOT_FOUND');
	}
	if (!content.file_id) throw new AppError('This learning material has no uploaded file.', 404, 'FILE_NOT_FOUND');
	const file = await repository.getUploadedFileById(content.file_id);
	if (!file) throw new AppError('The uploaded learning file was not found.', 404, 'FILE_NOT_FOUND');
	const opened = await storage.getStorageProvider().open(file.storage_key);
	return {
		mimeType: file.mime_type || 'application/octet-stream',
		sizeBytes: opened.sizeBytes || Number(file.size_bytes || 0),
		stream: opened.stream,
	};
};

const createContent = async ({ moduleId, title, type, contentText, contentUrl, fileId, orderNumber, isRequired, isPublished, isAuthorized, durationMinutes, createdBy, actor }) => {
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
		fileId,
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

const assertPermissionListScope = async ({ module, actor }) => {
	if (isSystemAdmin(actor?.role)) return;
	await assertFacilityAdminModuleScope(module, actor);
};

const assertFacilityAdminGrantorScope = async ({ module, actor }) => {
	if (!isFacilityAdmin(actor?.role)) {
		throw new AppError('Only facility administrators can grant or revoke mentor module permissions.', 403, 'FORBIDDEN');
	}
	await assertFacilityAdminModuleScope(module, actor);
};

const assertMentorEligibleForModule = async ({ mentorId, moduleId, actor }) => {
	if (!(await repository.isMentor(mentorId))) {
		throw new AppError('Permissions can only be granted to a mentor.', 400, 'VALIDATION_ERROR');
	}

	if (actor) {
		const mentor = await repository.getUserById(mentorId);
		if (!mentor) {
			throw new AppError('Mentor not found.', 404, 'NOT_FOUND');
		}
		if (Number(mentor.facility_id) !== Number(actor.facility_id)) {
			throw new AppError('You can only grant access to mentors within your facility.', 403, 'FORBIDDEN');
		}
	}

	if (!(await repository.hasActiveMentorAssignment({ mentorId, moduleId }))) {
		throw new AppError('The mentor must have an active assignment for this module thematic area.', 409, 'CONFLICT');
	}
};

const listModuleMentorPermissions = async (moduleId, actor) => {
	const module = await ensureModule(moduleId);
	await assertPermissionListScope({ module, actor });
	return repository.listModuleMentorPermissions(moduleId);
};

const grantModuleMentorPermission = async ({ mentorId, moduleId, actor, grantedBy }) => {
	const module = await ensureModule(moduleId);
	await assertFacilityAdminGrantorScope({ module, actor });
	const permission = LearningPermission.RESOURCES_VIEW;
	if (permission === LearningPermission.RESOURCES_VIEW && !isModulePublishedAndAuthorized(module)) {
		throw new AppError('Resource-view permission can only be granted for a published and authorized module.', 409, 'CONFLICT');
	}
	await assertMentorEligibleForModule({ mentorId, moduleId, actor });
	return repository.grantModuleMentorPermission({
		moduleId,
		mentorId,
		permission,
		grantedBy: actor?.id || grantedBy,
	});
};

const revokeModuleMentorPermission = async ({ mentorId, moduleId, actor, revokedBy }) => {
	const module = await ensureModule(moduleId);
	await assertFacilityAdminGrantorScope({ module, actor });
	if (!(await repository.isMentor(mentorId))) throw new AppError('Mentor not found.', 404, 'NOT_FOUND');
	await assertMentorEligibleForModule({ mentorId, moduleId, actor });
	return repository.revokeModuleMentorAccess({
		mentorId,
		moduleId,
		revokedBy: actor?.id || revokedBy,
	});
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
	if (!quiz.questions || quiz.questions.length === 0) {
		throw new AppError('This quiz does not have any questions yet.', 409, 'CONFLICT');
	}
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

const assertFacilityAdminQuizScope = async (module, actor) => {
	if (!isFacilityAdmin(actor?.role)) {
		throw new AppError('Only facility administrators can manage quiz configuration.', 403, 'FORBIDDEN');
	}
	await assertFacilityAdminModuleScope(module, actor);
};

const assertCanViewQuizAnswerKey = async ({ quiz, module, actor }) => {
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
	await assertMentorPermission({
		moduleId: module.id,
		mentorId: actor.id ?? actor.userId,
		permission: LearningPermission.QUIZ_ANSWER_KEY_VIEW,
	});
};

const getQuizForManagement = async (quizId, actor) => {
	const visibleQuiz = await repository.getQuizById(quizId, { includeCorrectAnswers: false });
	if (!visibleQuiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	const module = await ensureModule(visibleQuiz.module_id);
	await assertFacilityAdminQuizScope(module, actor);
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: true });
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	return quiz;
};

const createQuiz = async ({ moduleId, createdBy, actor, ...payload }) => {
	const module = await ensureModule(moduleId);
	await assertFacilityAdminQuizScope(module, actor);
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
	const quiz = await repository.getQuizById(quizId, { includeCorrectAnswers: true });
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	const module = await ensureModule(quiz.module_id);
	await assertCanViewQuizAnswerKey({ quiz, module, actor });
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
	updateQuiz,
	listContents,
	getContent,
	openContentFile,
	createContent,
	updateContent,
	deleteContent,
	assertMentorCanAccessMentee,
	listModuleMentorPermissions,
	grantModuleMentorPermission,
	revokeModuleMentorPermission,
	getMenteeModules,
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
