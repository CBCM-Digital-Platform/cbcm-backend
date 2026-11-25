const { Op } = require('sequelize');
const { QuizImportDraft, Quiz, QuizQuestion, QuizQuestionOption, QuizAttempt, sequelize } = require('../models');

const draftInclude = [
	{ model: require('../models').LearningModule, as: 'module', attributes: ['id', 'title'] },
	{ model: require('../models').UploadedFile, as: 'questionFile', attributes: ['id', 'original_name', 'mime_type', 'size_bytes'] },
	{ model: require('../models').UploadedFile, as: 'answerKeyFile', attributes: ['id', 'original_name', 'mime_type', 'size_bytes'] },
];

const createDraft = (values) => QuizImportDraft.create(values);
const getDraft = (id) => QuizImportDraft.findByPk(id, { include: draftInclude });
const updateDraft = async (id, values) => {
	const draft = await QuizImportDraft.findByPk(id);
	if (!draft) return null;
	await draft.update(values);
	return getDraft(id);
};

const confirmDraft = async ({ draftId, title, description, assessmentStage, passScore, timeLimitMinutes, attemptLimit, createdBy }) => sequelize.transaction(async (transaction) => {
	const [claimed] = await QuizImportDraft.update(
		{ status: 'confirming' },
		{ where: { id: draftId, status: { [Op.notIn]: ['confirmed', 'confirming'] } }, transaction },
	);
	if (!claimed) throw new Error('This quiz import has already been confirmed or is being confirmed.');
	const draft = await QuizImportDraft.findByPk(draftId, { transaction, lock: transaction.LOCK.UPDATE });
	if (!draft) throw new Error('Quiz import draft was not found.');
	let quiz = draft.thematic_area_id
		? await Quiz.findOne({ where: { thematic_area_id: draft.thematic_area_id }, transaction, lock: transaction.LOCK.UPDATE })
		: null;
	if (!quiz) {
		quiz = await Quiz.create({
			module_id: draft.module_id,
			thematic_area_id: draft.thematic_area_id,
			title,
			description: description || null,
			assessment_stage: assessmentStage,
			pass_score: passScore ?? 0,
			time_limit_minutes: timeLimitMinutes ?? 0,
			attempt_limit: attemptLimit ?? 1,
			is_published: false,
			is_authorized: false,
			created_by: createdBy,
		}, { transaction });
	} else if (await QuizAttempt.count({ where: { quiz_id: quiz.id }, transaction })) {
		throw new Error('This shared quiz already has attempts and its question set is protected. Create a new quiz version before importing more questions.');
	}

	for (const [index, question] of draft.questions.entries()) {
		const createdQuestion = await QuizQuestion.create({
			quiz_id: quiz.id,
			prompt: question.prompt,
			question_type: question.questionType || 'single_choice',
			clinical_context: question.clinicalContext || null,
			points: question.points || 1,
			explanation: question.explanation || null,
			order_number: question.orderNumber ?? index,
		}, { transaction });
		for (const [optionIndex, option] of (question.options || []).entries()) {
			await QuizQuestionOption.create({
				question_id: createdQuestion.id,
				text: option.text,
				is_correct: Boolean(option.isCorrect),
				order_number: option.orderNumber ?? optionIndex,
			}, { transaction });
		}
	}

	await draft.update({ assessment_stage: assessmentStage, status: 'confirmed', quiz_id: quiz.id, confirmed_at: new Date() }, { transaction });
	return quiz;
});

module.exports = { createDraft, getDraft, updateDraft, confirmDraft };
