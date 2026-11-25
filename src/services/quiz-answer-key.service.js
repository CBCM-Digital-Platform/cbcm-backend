const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const models = require('../models');
const repository = require('../repositories/learning.repository');
const quizPdfImport = require('./quiz-pdf-import.service');

const assertAdmin = (actor) => { if (String(actor?.role || '').toLowerCase() !== Role.ADMIN) throw new AppError('Only Super Admin can process answer keys.', 403, 'FORBIDDEN'); };

const start = async ({ resourceId, actor }) => {
  assertAdmin(actor);
  const resource = await models.Resource.findByPk(resourceId);
  if (!resource || resource.category !== 'ANSWER_KEY') throw new AppError('ANSWER_KEY resource not found.', 404, 'NOT_FOUND');
  const quizzes = await models.Quiz.findAll({ where: { thematic_area_id: resource.thematic_area_id } });
  if (!quizzes.length) throw new AppError('No shared quiz exists for this thematic area. Create the quiz before applying an answer key.', 409, 'QUIZ_NOT_FOUND_FOR_THEMATIC_AREA');
  if (quizzes.length > 1) throw new AppError('Multiple shared quizzes exist for this thematic area. Resolve the quiz configuration first.', 409, 'QUIZ_CONFIGURATION_CONFLICT');
  const [application] = await models.QuizAnswerKeyApplication.findOrCreate({ where: { resource_id: resource.id }, defaults: { resource_id: resource.id, answer_key_file_id: resource.file_id, thematic_area_id: resource.thematic_area_id, quiz_id: quizzes[0].id, created_by: actor.id } });
  return application;
};

const extract = async ({ applicationId, actor }) => {
  assertAdmin(actor);
  const application = await models.QuizAnswerKeyApplication.findByPk(applicationId);
  if (!application) throw new AppError('Answer Key application not found.', 404, 'NOT_FOUND');
  if (application.status === 'confirmed') throw new AppError('This Answer Key application is already confirmed.', 409, 'CONFLICT');
  const quiz = await repository.getQuizByThematicArea(application.thematic_area_id, { includeCorrectAnswers: true });
  if (!quiz) throw new AppError('No shared quiz exists for this thematic area.', 409, 'QUIZ_NOT_FOUND_FOR_THEMATIC_AREA');
  const pdf = await quizPdfImport.readPdf(application.answer_key_file_id);
  const entries = quizPdfImport.answerKeyEntriesFromText(pdf.text);
  const questions = (quiz.questions || []).slice().sort((a, b) => Number(a.order_number) - Number(b.order_number));
  const proposed = [];
  const warnings = [];
  for (const [number, entry] of entries.entries()) {
    const question = questions[number - 1];
    if (!question) {
      proposed.push({ sourceNumber: number, detectedLabels: entry.options, selectedOptionIds: [], answerSource: 'answer_key_pdf', matchingStatus: 'missing', warnings: ['No quiz question matched this answer number.'] });
      warnings.push(`Answer ${number} could not be matched to an existing quiz question.`);
      continue;
    }
    const selected = [];
    const invalid = [];
    for (const label of entry.options) {
      const index = label.charCodeAt(0) - 65;
      const option = question.options?.[index];
      if (option) selected.push(option.id); else invalid.push(label);
    }
    const status = invalid.length ? 'invalid' : (selected.length ? 'confirmed' : 'missing');
    const item = { sourceNumber: number, questionId: question.id, questionPrompt: question.prompt, detectedLabels: entry.options, selectedOptionIds: selected, existingCorrectOptionIds: (question.options || []).filter((o) => o.is_correct).map((o) => o.id), answerSource: 'answer_key_pdf', matchingStatus: status, explanation: entry.explanation || null, warnings: invalid.length ? [`Invalid option label(s): ${invalid.join(', ')}`] : [] };
    proposed.push(item);
    if (invalid.length) warnings.push(`Answer ${number} contains invalid option label(s): ${invalid.join(', ')}.`);
  }
  for (const question of questions) {
    if (!proposed.some((item) => item.questionId === question.id)) proposed.push({ questionId: question.id, questionPrompt: question.prompt, detectedLabels: [], selectedOptionIds: [], existingCorrectOptionIds: (question.options || []).filter((o) => o.is_correct).map((o) => o.id), answerSource: 'answer_key_pdf', matchingStatus: 'missing', warnings: ['No answer-key entry was found.'] });
  }
  await application.update({ status: 'review', proposed_answers: proposed, warnings });
  return application;
};

module.exports = { start, extract };
