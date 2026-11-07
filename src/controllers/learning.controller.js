const service = require('../services/learning.service');
const moduleDto = require('../dtos/response/module.response.dto');
const quizDto = require('../dtos/response/quiz-result.response.dto');
const learningMapper = require('../mappers/learning.mapper');
const AppError = require('../errors/app-error');
const quizPdfImportService = require('../services/quiz-pdf-import.service');

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
			publishedOnly: role === 'mentor' || req.query.publishedOnly === 'true',
			authorizedOnly: role === 'mentor' || req.query.authorizedOnly === 'true',
		}, req.user);
		return res.json({ success: true, data: modules.map((module) => moduleDto.toModule(module)) });
	}),
	getModule: asyncHandler(async (req, res) => {
		const moduleRecord = await service.getModule(req.params.id, req.user);
		return res.json({ success: true, data: moduleDto.toModule(moduleRecord) });
	}),
	createModule: asyncHandler(async (req, res) => {
		const moduleRecord = await service.createModule({ ...req.learningInput, createdBy: req.user.id, updatedBy: req.user.id }, req.user);
		return res.status(201).json({ success: true, data: moduleDto.toModule(moduleRecord) });
	}),
	updateModule: asyncHandler(async (req, res) => {
		const moduleRecord = await service.updateModule(req.params.id, { ...req.learningInput, updatedBy: req.user.id }, req.user);
		return res.json({ success: true, data: moduleDto.toModule(moduleRecord) });
	}),
	deleteModule: asyncHandler(async (req, res) => {
		await service.deleteModule(req.params.id, req.user);
		return res.json({ success: true, data: { deleted: true } });
	}),
	listContents: asyncHandler(async (req, res) => {
		const contents = await service.listContents(req.params.moduleId, req.user);
		return res.json({ success: true, data: contents });
	}),
	getContent: asyncHandler(async (req, res) => {
		const content = await service.getContent(req.params.contentId, req.user);
		if (Number(content.module_id) !== Number(req.params.moduleId)) {
			throw new AppError('Learning content not found.', 404, 'NOT_FOUND');
		}
		return res.json({ success: true, data: content });
	}),
	downloadContentFile: asyncHandler(async (req, res, next) => {
		const file = await service.openContentFile(req.params.moduleId, req.params.contentId, req.user);
		res.setHeader('Content-Type', file.mimeType);
		res.setHeader('Content-Length', String(file.sizeBytes || 0));
		res.setHeader('Content-Disposition', 'inline');
		file.stream.on('error', next);
		return file.stream.pipe(res);
	}),
	createContent: asyncHandler(async (req, res) => {
		const content = await service.createContent({
			...req.learningInput,
			moduleId: req.params.moduleId,
			createdBy: req.user.id,
			actor: req.user,
		});
		return res.status(201).json({ success: true, data: content });
	}),
	updateContent: asyncHandler(async (req, res) => {
		const content = await service.updateContent(req.params.moduleId, req.params.contentId, { ...req.learningInput, updatedBy: req.user.id }, req.user);
		return res.json({ success: true, data: content });
	}),
	deleteContent: asyncHandler(async (req, res) => {
		await service.deleteContent(req.params.moduleId, req.params.contentId, req.user);
		return res.json({ success: true, data: { deleted: true } });
	}),
	getModuleMentorPermissions: asyncHandler(async (req, res) => {
		const permissions = await service.listModuleMentorPermissions(req.params.moduleId, req.user);
		return res.json({ success: true, data: permissions.map(learningMapper.toMentorPermission) });
	}),
	grantModuleMentorPermission: asyncHandler(async (req, res) => {
		const grant = await service.grantModuleMentorPermission({
			moduleId: req.params.moduleId,
			mentorId: req.learningInput.mentorId,
			actor: req.user,
		});
		return res.status(201).json({ success: true, data: learningMapper.toMentorPermission(grant) });
	}),
	revokeModuleMentorPermission: asyncHandler(async (req, res) => {
		const revoked = await service.revokeModuleMentorPermission({
			moduleId: req.params.moduleId,
			mentorId: req.params.mentorId,
			actor: req.user,
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
				req.user
			)).map(learningMapper.toProgress),
		});
	}),
	assignModuleToMentee: asyncHandler(async (req, res) => {
		const progress = await service.assignModuleToMentee({
			moduleId: req.params.moduleId,
			menteeId: req.learningInput.menteeId,
			actor: req.user,
		});
		return res.status(201).json({ success: true, data: learningMapper.toProgress(progress) });
	}),
	revokeModuleAssignment: asyncHandler(async (req, res) => {
		const result = await service.revokeModuleAssignment({
			moduleId: req.params.moduleId,
			menteeId: req.params.menteeId,
			actor: req.user,
		});
		return res.json({ success: true, data: result });
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
	getQuizByModuleForViewer: asyncHandler(async (req, res) => {
		const quiz = await service.getQuizByModuleForViewer(req.params.moduleId, req.user);
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
			actor: req.user,
			...req.learningInput,
		});
		return res.status(201).json({ success: true, data: quiz });
	}),
	updateQuiz: asyncHandler(async (req, res) => {
		const quiz = await service.updateQuiz(req.params.quizId, req.learningInput, req.user);
		return res.json({ success: true, data: quiz });
	}),
	listQuizQuestions: asyncHandler(async (req, res) => res.json({
		success: true,
		data: await service.listQuizQuestions(req.params.quizId, req.user),
	})),
	createQuizQuestion: asyncHandler(async (req, res) => res.status(201).json({
		success: true,
		data: await service.createQuizQuestion(req.params.quizId, req.learningInput, req.user),
	})),
	updateQuizQuestion: asyncHandler(async (req, res) => res.json({
		success: true,
		data: await service.updateQuizQuestion(req.params.quizId, req.params.questionId, req.learningInput, req.user),
	})),
	deleteQuizQuestion: asyncHandler(async (req, res) => {
		await service.deleteQuizQuestion(req.params.quizId, req.params.questionId, req.user);
		return res.json({ success: true, data: { deleted: true } });
	}),
	createQuestionOption: asyncHandler(async (req, res) => res.status(201).json({
		success: true,
		data: await service.createQuestionOption(req.params.questionId, req.learningInput, req.user),
	})),
	updateQuestionOption: asyncHandler(async (req, res) => res.json({
		success: true,
		data: await service.updateQuestionOption(req.params.questionId, req.params.optionId, req.learningInput, req.user),
	})),
	deleteQuestionOption: asyncHandler(async (req, res) => {
		await service.deleteQuestionOption(req.params.questionId, req.params.optionId, req.user);
		return res.json({ success: true, data: { deleted: true } });
	}),
	getQuizAnswerKey: asyncHandler(async (req, res) => {
		const answerKey = await service.getQuizAnswerKey({ quizId: req.params.quizId, actor: req.user });
		return res.json({ success: true, data: answerKey });
	}),
	createQuizImport: asyncHandler(async (req, res) => {
		const draft = await quizPdfImportService.upload({ actor: req.user, moduleId: req.params.moduleId, question: req.quizPdfs.question, answerKey: req.quizPdfs.answerKey });
		return res.status(201).json({ success: true, data: draft });
	}),
	extractQuizImport: asyncHandler(async (req, res) => {
		const draft = await quizPdfImportService.extract(req.params.draftId, req.user);
		return res.json({ success: true, data: draft });
	}),
	getQuizImport: asyncHandler(async (req, res) => {
		const draft = await quizPdfImportService.get(req.params.draftId, req.user);
		return res.json({ success: true, data: draft });
	}),
	updateQuizImportQuestion: asyncHandler(async (req, res) => {
		const draft = await quizPdfImportService.updateQuestion(req.params.draftId, Number(req.params.questionIndex), req.body, req.user);
		return res.json({ success: true, data: draft });
	}),
	deleteQuizImportQuestion: asyncHandler(async (req, res) => {
		const draft = await quizPdfImportService.deleteQuestion(req.params.draftId, Number(req.params.questionIndex), req.user);
		return res.json({ success: true, data: draft });
	}),
	confirmQuizImport: asyncHandler(async (req, res) => {
		const quiz = await quizPdfImportService.confirm(req.params.draftId, req.body, req.user);
		return res.status(201).json({ success: true, data: quiz });
	}),
};
