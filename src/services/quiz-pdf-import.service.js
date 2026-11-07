const pdfParse = require('pdf-parse');
const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const models = require('../models');
const storage = require('../providers/storage.provider');
const uploadsService = require('./uploads.service');
const repository = require('../repositories/quiz-imports.repository');

const assertAdmin = (actor) => {
	if (String(actor?.role || '').toLowerCase() !== Role.ADMIN) {
		throw new AppError('Only Super Admin can manage quiz imports.', 403, 'FORBIDDEN');
	}
};

const streamToBuffer = async (stream) => {
	const chunks = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	return Buffer.concat(chunks);
};

const readPdf = async (fileId) => {
	const file = await models.UploadedFile.findByPk(fileId);
	if (!file) throw new AppError('Quiz import PDF was not found.', 404, 'FILE_NOT_FOUND');
	const opened = await storage.getStorageProvider().open(file.storage_key);
	return pdfParse(await streamToBuffer(opened.stream));
};

const answerKeyFromText = (text) => {
	const answers = new Map();
	for (const line of String(text || '').split(/\r?\n/)) {
		const match = line.match(/^\s*(?:question\s*)?(\d+)\s*(?:[.):]|-)\s*([A-D](?:\s*[,/]\s*[A-D])?)\b/i);
		if (match) answers.set(Number(match[1]), match[2].toUpperCase().split(/\s*[,/]\s*/));
	}
	return answers;
};

const parseQuestions = (text, answerKeyText = '') => {
	const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
	const questions = [];
	const warnings = [];
	let current = null;
	let inAnswerSection = false;
	for (const line of lines) {
		if (/^(answer\s*key|answers)\s*:?$/i.test(line)) { inAnswerSection = true; continue; }
		if (/^end\s+of\s+questions\b/i.test(line)) break;
		if (inAnswerSection) continue;
		const questionMatch = line.match(/^(\d+)\s*[.)]\s*(.+)$/);
		const optionMatch = line.match(/^([A-D])\s*[.)\-:]\s*(.+)$/i);
		if (questionMatch) {
			current = { sourceNumber: Number(questionMatch[1]), prompt: questionMatch[2].trim(), options: [], orderNumber: questions.length, questionType: 'single_choice', points: 1, requiresReview: false, warnings: [] };
			questions.push(current);
		} else if (optionMatch && current) {
			current.options.push({ label: optionMatch[1].toUpperCase(), text: optionMatch[2].trim(), orderNumber: current.options.length, isCorrect: false });
		} else if (current) {
			if (current.options.length) current.options[current.options.length - 1].text += ` ${line}`;
			else current.prompt += ` ${line}`;
		}
	}
	if (!questions.length) throw new AppError('The PDF contains no extractable text questions. Scanned or image-only PDFs are not supported.', 422, 'PDF_TEXT_NOT_FOUND');
	const answers = answerKeyFromText(`${answerKeyText}\n${String(text).split(/answer\s*key/i)[1] || ''}`);
	for (const question of questions) {
		const answer = answers.get(question.sourceNumber);
		if (!question.options.length || question.options.length < 2) {
			question.requiresReview = true;
			question.warnings.push('Fewer than two answer options were extracted.');
		}
		if (answer) {
			for (const option of question.options) option.isCorrect = answer.includes(option.label);
			if (!question.options.some((option) => option.isCorrect)) {
				question.requiresReview = true;
				question.warnings.push('Answer-key option does not match extracted options.');
			}
			if (answer.length > 1) question.questionType = 'multiple_choice';
		} else {
			question.requiresReview = true;
			question.warnings.push('No confident correct answer was found.');
		}
		if (question.warnings.length) warnings.push(`Question ${question.sourceNumber}: ${question.warnings.join(' ')}`);
	}
	return { questions, warnings };
};

const upload = async ({ actor, moduleId, question, answerKey }) => {
	assertAdmin(actor);
	if (!(await models.LearningModule.findByPk(moduleId, { attributes: ['id'] }))) {
		throw new AppError('Learning module not found.', 404, 'NOT_FOUND');
	}
	const questionFile = await uploadsService.createUpload({ actor, upload: question, context: 'quiz-import-question-pdf' });
	let answerKeyFile;
	try {
		if (answerKey) answerKeyFile = await uploadsService.createUpload({ actor, upload: answerKey, context: 'quiz-import-answer-key-pdf' });
		return repository.createDraft({ module_id: moduleId, question_file_id: questionFile.id, answer_key_file_id: answerKeyFile?.id || null, created_by: actor.id });
	} catch (error) {
		if (answerKeyFile) await uploadsService.deleteUpload(answerKeyFile.id, actor).catch(() => {});
		await uploadsService.deleteUpload(questionFile.id, actor).catch(() => {});
		throw error;
	}
};

const extract = async (draftId, actor) => {
	assertAdmin(actor);
	const draft = await repository.getDraft(draftId);
	if (!draft) throw new AppError('Quiz import draft was not found.', 404, 'NOT_FOUND');
	if (draft.status === 'confirmed') throw new AppError('This quiz import has already been confirmed.', 409, 'CONFLICT');
	const questionPdf = await readPdf(draft.question_file_id);
	const answerPdf = draft.answer_key_file_id ? await readPdf(draft.answer_key_file_id) : null;
	const parsed = parseQuestions(questionPdf.text, answerPdf?.text);
	return repository.updateDraft(draftId, { status: 'extracted', questions: parsed.questions, warnings: parsed.warnings });
};

const get = async (draftId, actor) => { assertAdmin(actor); const draft = await repository.getDraft(draftId); if (!draft) throw new AppError('Quiz import draft was not found.', 404, 'NOT_FOUND'); return draft; };

const updateQuestion = async (draftId, index, payload, actor) => {
	assertAdmin(actor);
	if (!Number.isInteger(index) || index < 0) throw new AppError('questionIndex must be a non-negative integer.', 400, 'VALIDATION_ERROR');
	const draft = await get(draftId, actor);
	if (draft.status === 'confirmed') throw new AppError('Confirmed imports cannot be edited.', 409, 'CONFLICT');
	const questions = Array.isArray(draft.questions) ? [...draft.questions] : [];
	if (!questions[index]) throw new AppError('Imported question was not found.', 404, 'NOT_FOUND');
	const updatedQuestion = { ...questions[index], ...payload, orderNumber: payload.orderNumber ?? questions[index].orderNumber };
	questions[index] = {
		...updatedQuestion,
		requiresReview: !hasValidReviewedAnswer(updatedQuestion),
		reviewed: hasValidReviewedAnswer(updatedQuestion),
	};
	return repository.updateDraft(draftId, { status: 'review', questions });
};

const deleteQuestion = async (draftId, index, actor) => {
	if (!Number.isInteger(index) || index < 0) throw new AppError('questionIndex must be a non-negative integer.', 400, 'VALIDATION_ERROR');
	const draft = await get(draftId, actor);
	if (draft.status === 'confirmed') throw new AppError('Confirmed imports cannot be edited.', 409, 'CONFLICT');
	const questions = (draft.questions || []).filter((_, questionIndex) => questionIndex !== index).map((question, orderNumber) => ({ ...question, orderNumber }));
	return repository.updateDraft(draftId, { status: 'review', questions });
};

const hasValidReviewedAnswer = (question) => Boolean(
	question
	&& typeof question.prompt === 'string'
	&& question.prompt.trim()
	&& Array.isArray(question.options)
	&& question.options.length >= 2
	&& question.options.some((option) => option && option.isCorrect === true),
);

const confirm = async (draftId, payload, actor) => {
	assertAdmin(actor);
	const draft = await repository.getDraft(draftId);
	if (!draft) throw new AppError('Quiz import draft was not found.', 404, 'NOT_FOUND');
	if (draft.status === 'confirmed' || draft.quiz_id) throw new AppError('This quiz import has already been confirmed.', 409, 'CONFLICT');
	if (!draft.questions?.length) throw new AppError('The import contains no questions.', 422, 'VALIDATION_ERROR');
	for (const [index, question] of draft.questions.entries()) {
		if (question.requiresReview === true || !hasValidReviewedAnswer(question)) {
			throw new AppError(`Question ${index + 1} requires review before confirmation.`, 422, 'IMPORT_REVIEW_REQUIRED');
		}
	}
	try {
		return await repository.confirmDraft({ draftId, title: payload.title, description: payload.description, passScore: payload.passScore, timeLimitMinutes: payload.timeLimitMinutes, attemptLimit: payload.attemptLimit, createdBy: actor.id });
	} catch (error) {
		if (error?.message === 'This quiz import has already been confirmed or is being confirmed.') {
			throw new AppError(error.message, 409, 'CONFLICT');
		}
		throw error;
	}
};

module.exports = { upload, extract, get, updateQuestion, deleteQuestion, confirm, parseQuestions, answerKeyFromText };
