process.env.JWT_SECRET = 'quiz-import-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const pdfParse = require('pdf-parse');
const importService = require('../../src/services/quiz-pdf-import.service');
const repository = require('../../src/repositories/quiz-imports.repository');

test('PDF import extracts numbered questions, A-D options, and a separate answer key', () => {
	const result = importService.parseQuestions(
		'1. First question?\nA. One\nB. Two\nC. Three\nD. Four\n2) Second question\nA) Alpha\nB) Beta\nC) Gamma\nD) Delta',
		'1. B\n2: C',
	);
	assert.equal(result.questions.length, 2);
	assert.equal(result.questions[0].prompt, 'First question?');
	assert.equal(result.questions[0].options[1].isCorrect, true);
	assert.equal(result.questions[1].options[2].isCorrect, true);
	assert.equal(result.questions.every((question) => !question.requiresReview), true);
});

test('PDF import accepts supported answer-key line formats', () => {
	assert.deepEqual([...importService.answerKeyFromText('Question 1: B\n2. C\n3) A\n4 - D')], [[1, ['B']], [2, ['C']], [3, ['A']], [4, ['D']]]);
});

test('actual maternal health PDFs match Question N answer-key lines and remove trailing metadata', async () => {
	const questionPdfPath = path.join(__dirname, '../../uploads/630c18f4-dc7f-4947-a740-930aba771d48.pdf');
	const answerKeyPdfPath = path.join(__dirname, '../../uploads/6552935a-42a9-4c97-9cd7-aa0abd8fc96b.pdf');
	assert.equal(fs.existsSync(questionPdfPath), true, 'uploaded maternal health question PDF is required');
	assert.equal(fs.existsSync(answerKeyPdfPath), true, 'uploaded maternal health answer-key PDF is required');
	const [questionPdf, answerKeyPdf] = await Promise.all([
		pdfParse(fs.readFileSync(questionPdfPath)),
		pdfParse(fs.readFileSync(answerKeyPdfPath)),
	]);
	const result = importService.parseQuestions(questionPdf.text, answerKeyPdf.text);
	assert.equal(result.questions.length, 10);
	assert.deepEqual(result.questions.map((question) => question.options.find((option) => option.isCorrect)?.label), ['B', 'C', 'A', 'B', 'C', 'B', 'B', 'B', 'C', 'B']);
	assert.equal(result.questions.every((question) => question.requiresReview === false), true);
	assert.equal(result.questions.at(-1).options.at(-1).text.includes('End of questions'), false);
});

test('PDF import reads an answer key appended to the question PDF', () => {
	const result = importService.parseQuestions('1. Pick one\nA. Yes\nB. No\n\nAnswer Key\n1. A');
	assert.equal(result.questions[0].options[0].isCorrect, true);
	assert.equal(result.questions[0].requiresReview, false);
});

test('PDF import never invents missing answers and flags review', () => {
	const result = importService.parseQuestions('1. Pick one\nA. Yes\nB. No');
	assert.equal(result.questions[0].options.some((option) => option.isCorrect), false);
	assert.equal(result.questions[0].requiresReview, true);
	assert.match(result.warnings.join(' '), /no confident correct answer/i);
});

test('scanned or image-only PDFs return an explicit unsupported extraction error', () => {
	assert.throws(() => importService.parseQuestions(''), { statusCode: 422, code: 'PDF_TEXT_NOT_FOUND' });
});

test('quiz import management rejects non-admin users before touching drafts', async () => {
	await assert.rejects(importService.get(1, { id: 2, role: 'facility_admin' }), { statusCode: 403, code: 'FORBIDDEN' });
	await assert.rejects(importService.upload({ actor: { id: 2, role: 'mentor' }, moduleId: 1, question: {} }), { statusCode: 403, code: 'FORBIDDEN' });
});

test('review edits and deletions persist through the draft repository', async () => {
	const originalGet = repository.getDraft;
	const originalUpdate = repository.updateDraft;
	let draft = { id: 4, status: 'extracted', questions: [{ prompt: 'Old', options: [] }, { prompt: 'Remove', options: [] }] };
	repository.getDraft = async () => draft;
	repository.updateDraft = async (_id, values) => { draft = { ...draft, ...values }; return draft; };
	try {
		await importService.updateQuestion(4, 0, { prompt: 'Updated' }, { id: 1, role: 'admin' });
		assert.equal(draft.questions[0].prompt, 'Updated');
		await importService.deleteQuestion(4, 1, { id: 1, role: 'admin' });
		assert.equal(draft.questions.length, 1);
	} finally {
		repository.getDraft = originalGet;
		repository.updateDraft = originalUpdate;
	}
});

test('correct extraction can be confirmed without a PUT edit', async () => {
	const originals = { getDraft: repository.getDraft, confirmDraft: repository.confirmDraft };
	let confirmed = false;
	repository.getDraft = async () => ({ id: 5, status: 'extracted', quiz_id: null, questions: [{ prompt: 'Ready?', requiresReview: false, options: [{ text: 'Yes', isCorrect: true }, { text: 'No', isCorrect: false }] }] });
	repository.confirmDraft = async () => { confirmed = true; return { id: 12, is_published: false, is_authorized: false }; };
	try {
		const quiz = await importService.confirm(5, { title: 'Ready quiz' }, { id: 1, role: 'admin' });
		assert.equal(confirmed, true);
		assert.equal(quiz.is_published, false);
	} finally {
		repository.getDraft = originals.getDraft;
		repository.confirmDraft = originals.confirmDraft;
	}
});

test('ambiguous, missing-answer, and invalid questions block confirmation', async () => {
	const original = repository.getDraft;
	for (const question of [
		{ prompt: 'Ambiguous', requiresReview: true, options: [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: false }] },
		{ prompt: 'Missing', options: [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: false }] },
		{ prompt: '', requiresReview: false, options: [{ text: 'A', isCorrect: true }] },
	]) {
		repository.getDraft = async () => ({ id: 7, status: 'extracted', quiz_id: null, questions: [question] });
		await assert.rejects(importService.confirm(7, { title: 'Blocked' }, { id: 1, role: 'admin' }), { code: 'IMPORT_REVIEW_REQUIRED' });
	}
	repository.getDraft = original;
});

test('edited questions clear review state and can then be confirmed', async () => {
	const originals = { getDraft: repository.getDraft, updateDraft: repository.updateDraft, confirmDraft: repository.confirmDraft };
	let draft = { id: 8, status: 'extracted', quiz_id: null, questions: [{ prompt: 'Missing answer', requiresReview: true, options: [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: false }] }] };
	repository.getDraft = async () => draft;
	repository.updateDraft = async (_id, values) => { draft = { ...draft, ...values }; return draft; };
	repository.confirmDraft = async () => ({ id: 13, is_published: false, is_authorized: false });
	try {
		await importService.updateQuestion(8, 0, { options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }] }, { id: 1, role: 'admin' });
		assert.equal(draft.questions[0].requiresReview, false);
		const quiz = await importService.confirm(8, { title: 'Fixed' }, { id: 1, role: 'admin' });
		assert.equal(quiz.is_published, false);
	} finally {
		repository.getDraft = originals.getDraft;
		repository.updateDraft = originals.updateDraft;
		repository.confirmDraft = originals.confirmDraft;
	}
});
