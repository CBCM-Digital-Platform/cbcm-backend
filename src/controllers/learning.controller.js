const service = require('../services/learning.service');
const moduleDto = require('../dtos/response/module.response.dto');
const quizDto = require('../dtos/response/quiz-result.response.dto');
const learningMapper = require('../mappers/learning.mapper');
const AppError = require('../errors/app-error');

const asyncHandler = (handler) => (req, res, next) => {
	Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = {
	listModules: asyncHandler(async (req, res) => {
		const role = String(req.user.role).toLowerCase();
		if (role === 'mentee') {
			const modules = await service.getMyModules(req.user.id);
			return res.json({ success: true, data: modules.map(learningMapper.toProgress) });
		}
		const modules = await service.listModules({
			status: req.query.status,
			thematicAreaId: req.query.thematicAreaId || req.query.thematic_area_id,
			createdBy: req.query.createdBy || req.query.created_by,
			mentorId: role === 'mentor' ? req.user.id : undefined,
			publishedOnly: role === 'mentor' || req.query.publishedOnly === 'true',
			authorizedOnly: role === 'mentor' || req.query.authorizedOnly === 'true',
		});
		return res.json({ success: true, data: modules.map((module) => moduleDto.toModule(module)) });
	}),
	getModule: asyncHandler(async (req, res) => {
		const moduleRecord = await service.getModule(req.params.id, { role: req.user.role, userId: req.user.id });
		return res.json({ success: true, data: moduleDto.toModule(moduleRecord) });
	}),
	createModule: asyncHandler(async (req, res) => {
		const moduleRecord = await service.createModule({ ...req.learningInput, createdBy: req.user.id, updatedBy: req.user.id });
		return res.status(201).json({ success: true, data: moduleDto.toModule(moduleRecord) });
	}),
	updateModule: asyncHandler(async (req, res) => {
		const moduleRecord = await service.updateModule(req.params.id, { ...req.learningInput, updatedBy: req.user.id });
		return res.json({ success: true, data: moduleDto.toModule(moduleRecord) });
	}),
	deleteModule: asyncHandler(async (req, res) => {
		await service.deleteModule(req.params.id);
		return res.json({ success: true, data: { deleted: true } });
	}),
	listContents: asyncHandler(async (req, res) => {
		const contents = await service.listContents(req.params.moduleId, { role: req.user.role, userId: req.user.id });
		return res.json({ success: true, data: contents });
	}),
	getContent: asyncHandler(async (req, res) => {
		const content = await service.getContent(req.params.contentId, { role: req.user.role, userId: req.user.id });
		if (Number(content.module_id) !== Number(req.params.moduleId)) {
			throw new AppError('Learning content not found.', 404, 'NOT_FOUND');
		}
		return res.json({ success: true, data: content });
	}),
	createContent: asyncHandler(async (req, res) => {
		const content = await service.createContent({
			...req.learningInput,
			moduleId: req.params.moduleId,
			createdBy: req.user.id,
		});
		return res.status(201).json({ success: true, data: content });
	}),
	updateContent: asyncHandler(async (req, res) => {
		const content = await service.updateContent(req.params.moduleId, req.params.contentId, { ...req.learningInput, updatedBy: req.user.id });
		return res.json({ success: true, data: content });
	}),
	deleteContent: asyncHandler(async (req, res) => {
		await service.deleteContent(req.params.moduleId, req.params.contentId);
		return res.json({ success: true, data: { deleted: true } });
	}),
	grantModuleAccess: asyncHandler(async (req, res) => {
		const menteeId = req.learningInput.menteeId;
		const result = await service.grantModuleAccess({ moduleId: req.params.moduleId, menteeId, mentorId: req.user.id });
		return res.status(201).json({ success: true, data: learningMapper.toProgress(result) });
	}),
	grantMentorModuleAccess: asyncHandler(async (req, res) => {
		const grant = await service.grantMentorModuleAccess({
			moduleId: req.params.moduleId,
			mentorId: req.learningInput.mentorId,
			grantedBy: req.user.id,
		});
		return res.status(201).json({ success: true, data: learningMapper.toMentorAccess(grant) });
	}),
	getModuleMentorAccess: asyncHandler(async (req, res) => {
		const grants = await service.getModuleMentorAccess(req.params.moduleId);
		return res.json({ success: true, data: grants.map(learningMapper.toMentorAccess) });
	}),
	revokeModuleMentorAccess: asyncHandler(async (req, res) => {
		const revoked = await service.revokeModuleMentorAccess({
			moduleId: req.params.moduleId,
			mentorId: req.params.mentorId,
		});
		return res.json({ success: true, data: { revoked } });
	}),
	getMenteeModules: asyncHandler(async (req, res) => {
		const menteeId = req.params.menteeId;
		if (String(req.user.role).toLowerCase() === 'mentor') {
			await service.assertMentorCanAccessMentee({ mentorId: req.user.id, menteeId });
		}
		return res.json({
			success: true,
			data: (await service.getMenteeModules(
				menteeId,
				String(req.user.role).toLowerCase() === 'mentor' ? req.user.id : undefined
			)).map(learningMapper.toProgress),
		});
	}),
	getModuleAccess: asyncHandler(async (req, res) => {
		const records = await service.getModuleAccess(req.params.moduleId);
		return res.json({ success: true, data: records.map(learningMapper.toProgress) });
	}),
	revokeModuleAccess: asyncHandler(async (req, res) => {
		const menteeId = req.params.menteeId;
		if (String(req.user.role).toLowerCase() === 'mentor') {
			await service.assertMentorCanAccessMentee({ mentorId: req.user.id, menteeId });
		}
		const deleted = await service.revokeModuleAccess({
			menteeId,
			moduleId: req.params.moduleId,
			mentorId: String(req.user.role).toLowerCase() === 'mentor' ? req.user.id : undefined,
		});
		return res.json({ success: true, data: { deleted } });
	}),
	getMyModules: asyncHandler(async (req, res) => {
		const records = await service.getMyModules(req.user.id);
		return res.json({ success: true, data: records.map(learningMapper.toProgress) });
	}),
	getMyModuleProgress: asyncHandler(async (req, res) => {
		const record = await service.getMyModuleProgress({ menteeId: req.user.id, moduleId: req.params.moduleId });
		return res.json({ success: true, data: learningMapper.toProgress(record) });
	}),
	getContentProgress: asyncHandler(async (req, res) => {
		const progress = await service.getContentProgress({ menteeId: req.user.id, moduleId: req.params.moduleId });
		return res.json({ success: true, data: progress });
	}),
	completeContent: asyncHandler(async (req, res) => {
		const progress = await service.completeContent({ menteeId: req.user.id, moduleId: req.params.moduleId, contentId: req.params.contentId });
		return res.json({ success: true, data: learningMapper.toProgress(progress) });
	}),
	confirmModuleCompletion: asyncHandler(async (req, res) => {
		const progress = await service.confirmModuleCompletion({ menteeId: req.user.id, moduleId: req.params.moduleId });
		return res.json({ success: true, data: learningMapper.toProgress(progress) });
	}),
	getQuizByModule: asyncHandler(async (req, res) => {
		const quiz = await service.getQuizByModule(req.params.moduleId, req.user.id);
		return res.json({ success: true, data: quiz });
	}),
	getQuiz: asyncHandler(async (req, res) => {
		const quiz = await service.getQuiz(req.params.quizId, req.user.id);
		return res.json({ success: true, data: quiz });
	}),
	startQuizAttempt: asyncHandler(async (req, res) => {
		const attempt = await service.startQuizAttempt({ quizId: req.params.quizId, menteeId: req.user.id });
		return res.status(201).json({ success: true, data: attempt });
	}),
	submitQuiz: asyncHandler(async (req, res) => {
		const result = await service.submitQuiz({ quizId: req.params.quizId, menteeId: req.user.id, answers: req.learningInput.answers });
		return res.json({ success: true, data: quizDto.toQuizResult(result) });
	}),
	getQuizResults: asyncHandler(async (req, res) => {
		const results = await service.getQuizResults({ quizId: req.params.quizId, menteeId: req.user.id });
		return res.json({ success: true, data: results });
	}),
	getQuizAttempts: asyncHandler(async (req, res) => {
		const attempts = await service.listQuizAttempts({ quizId: req.params.quizId, menteeId: req.user.id });
		return res.json({ success: true, data: attempts });
	}),
	createQuiz: asyncHandler(async (req, res) => {
		const quiz = await service.createQuiz({
			moduleId: req.params.moduleId,
			createdBy: req.user.id,
			...req.learningInput,
		});
		return res.status(201).json({ success: true, data: quiz });
	}),
	updateQuiz: asyncHandler(async (req, res) => {
		const quiz = await service.updateQuiz(req.params.quizId, req.learningInput);
		return res.json({ success: true, data: quiz });
	}),
	listQuizQuestions: asyncHandler(async (req, res) => res.json({
		success: true,
		data: await service.listQuizQuestions(req.params.quizId),
	})),
	createQuizQuestion: asyncHandler(async (req, res) => res.status(201).json({
		success: true,
		data: await service.createQuizQuestion(req.params.quizId, req.learningInput),
	})),
	updateQuizQuestion: asyncHandler(async (req, res) => res.json({
		success: true,
		data: await service.updateQuizQuestion(req.params.quizId, req.params.questionId, req.learningInput),
	})),
	deleteQuizQuestion: asyncHandler(async (req, res) => {
		await service.deleteQuizQuestion(req.params.quizId, req.params.questionId);
		return res.json({ success: true, data: { deleted: true } });
	}),
	createQuestionOption: asyncHandler(async (req, res) => res.status(201).json({
		success: true,
		data: await service.createQuestionOption(req.params.questionId, req.learningInput),
	})),
	updateQuestionOption: asyncHandler(async (req, res) => res.json({
		success: true,
		data: await service.updateQuestionOption(req.params.questionId, req.params.optionId, req.learningInput),
	})),
	deleteQuestionOption: asyncHandler(async (req, res) => {
		await service.deleteQuestionOption(req.params.questionId, req.params.optionId);
		return res.json({ success: true, data: { deleted: true } });
	}),
};
