process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const request = require('supertest');
const repository = require('../../src/repositories/exams.repository');
const service = require('../../src/services/exam-questions.service');
const models = require('../../src/models');
const { parseExamQuestionsQuery } = require('../../src/validators/exam-import.validator');
const requireRole = require('../../src/middlewares/auth/require-role.middleware');

function examFixture(stage = 'PRE_TEST') {
	return {
		id: 12,
		title: 'Family Planning Examination',
		description: null,
		stage,
		cycle_id: 3,
		thematic_area_id: 2,
		version: 1,
		total_questions: 2,
		total_marks: 3,
		is_published: true,
		is_authorized: true,
		questions: [
			{
				id: 101,
				question_text: 'First question',
				order_number: 1,
				marks: 1,
				options: [
					{ id: 1001, option_label: 'A', option_text: 'First A', is_correct: true },
					{ id: 1002, option_label: 'B', option_text: 'First B', is_correct: false },
				],
			},
			{
				id: 102,
				question_text: 'Second question',
				order_number: 2,
				marks: 2,
				options: [
					{ id: 1003, option_label: 'A', option_text: 'Second A', is_correct: false },
					{ id: 1004, option_label: 'B', option_text: 'Second B', is_correct: true },
				],
			},
		],
	};
}

function setRepository({ assignment = { id: 9 }, exams = [examFixture()] } = {}) {
	const originals = {
		findMenteeExamAssignment: repository.findMenteeExamAssignment,
		findPublishedExams: repository.findPublishedExams,
	};
	let scope;
	repository.findMenteeExamAssignment = async (value) => { scope = value; return assignment; };
	repository.findPublishedExams = async () => exams;
	return { originals, getScope: () => scope };
}

test('retrieves PRE_TEST questions for the authenticated mentee', async () => {
	const state = setRepository();
	try {
		const result = await service.getExamQuestions({
			actor: { id: 7, role: 'mentee', facility_id: 5 },
			query: { stage: 'PRE_TEST', cycleId: 3, thematicAreaId: 2 },
		});
		assert.equal(result.stage, 'PRE_TEST');
		assert.equal(result.id, 12);
		assert.deepEqual(state.getScope(), { menteeId: 7, cycleId: 3, thematicAreaId: 2, facilityId: 5 });
	} finally { Object.assign(repository, state.originals); }
});

test('retrieves POST_TEST questions and preserves question and option order', async () => {
	const state = setRepository({ exams: [examFixture('POST_TEST')] });
	try {
		const result = await service.getExamQuestions({
			actor: { id: 7, role: 'mentee', facility_id: 5 },
			query: { stage: 'POST_TEST', cycleId: 3, thematicAreaId: 2 },
		});
		assert.equal(result.stage, 'POST_TEST');
		assert.deepEqual(result.questions.map((question) => question.id), [101, 102]);
		assert.deepEqual(result.questions[0].options.map((option) => option.label), ['A', 'B']);
	} finally { Object.assign(repository, state.originals); }
});

test('never exposes correct-answer information in the response DTO', async () => {
	const state = setRepository();
	try {
		const result = await service.getExamQuestions({ actor: { id: 7, role: 'mentee', facility_id: 5 }, query: { stage: 'PRE_TEST', cycleId: 3, thematicAreaId: 2 } });
		const serialized = JSON.stringify(result).toLowerCase();
		assert.equal(serialized.includes('is_correct'), false);
		assert.equal(serialized.includes('correct_option'), false);
		assert.equal(serialized.includes('answer_key'), false);
		assert.equal(Object.hasOwn(result.questions[0].options[0], 'is_correct'), false);
	} finally { Object.assign(repository, state.originals); }
});

test('requires an active mentee assignment in the same cycle, thematic area, and facility', async () => {
	for (const query of [
		{ cycleId: 99, thematicAreaId: 2 },
		{ cycleId: 3, thematicAreaId: 99 },
	]) {
		const state = setRepository({ assignment: null });
		try {
			await assert.rejects(() => service.getExamQuestions({ actor: { id: 7, role: 'mentee', facility_id: 5 }, query: { stage: 'PRE_TEST', ...query } }), { code: 'EXAM_ACCESS_DENIED' });
		} finally { Object.assign(repository, state.originals); }
	}
});

test('rejects a mentee with no facility ownership scope', async () => {
	const state = setRepository({ assignment: null });
	try {
		await assert.rejects(() => service.getExamQuestions({ actor: { id: 7, role: 'mentee', facility_id: 8 }, query: { stage: 'PRE_TEST', cycleId: 3, thematicAreaId: 2 } }), { code: 'EXAM_ACCESS_DENIED' });
	} finally { Object.assign(repository, state.originals); }
});

test('repository eligibility requires published and authorized exams and excludes answer flags', async () => {
	const originalFindAll = models.Exam.findAll;
	let options;
	models.Exam.findAll = async (value) => { options = value; return []; };
	try {
		await repository.findPublishedExams({ cycleId: 3, thematicAreaId: 2, stage: 'POST_TEST' });
		assert.deepEqual(options.where, { cycle_id: 3, thematic_area_id: 2, stage: 'POST_TEST', is_published: true, is_authorized: true });
		assert.equal(options.include[0].include[0].attributes.includes('is_correct'), false);
	} finally { models.Exam.findAll = originalFindAll; }
});

test('returns a not-found error when no published and authorized exam exists', async () => {
	const state = setRepository({ exams: [] });
	try {
		await assert.rejects(() => service.getExamQuestions({ actor: { id: 7, role: 'mentee', facility_id: 5 }, query: { stage: 'PRE_TEST', cycleId: 3, thematicAreaId: 2 } }), { code: 'EXAM_NOT_FOUND' });
	} finally { Object.assign(repository, state.originals); }
});

test('does not arbitrarily select when multiple published versions match', async () => {
	const state = setRepository({ exams: [examFixture(), { ...examFixture(), id: 13, version: 2 }] });
	try {
		await assert.rejects(() => service.getExamQuestions({ actor: { id: 7, role: 'mentee', facility_id: 5 }, query: { stage: 'PRE_TEST', cycleId: 3, thematicAreaId: 2 } }), { code: 'AMBIGUOUS_EXAM_VERSION' });
	} finally { Object.assign(repository, state.originals); }
});

test('validates stage and positive scope identifiers', () => {
	assert.deepEqual(parseExamQuestionsQuery({ stage: 'post_test', cycle_id: '3', thematic_area_id: '2' }), { stage: 'POST_TEST', cycleId: 3, thematicAreaId: 2 });
	assert.throws(() => parseExamQuestionsQuery({ stage: 'PRETEST', cycle_id: 3, thematic_area_id: 2 }), { code: 'VALIDATION_ERROR' });
	assert.throws(() => parseExamQuestionsQuery({ stage: 'PRE_TEST', cycle_id: 0, thematic_area_id: 2 }), { code: 'VALIDATION_ERROR' });
});

test('rejects unauthenticated retrieval and non-mentee roles', async () => {
	const app = require('../../src/app');
	const response = await request(app).get('/api/v1/exams/questions?stage=PRE_TEST&cycle_id=3&thematic_area_id=2');
	assert.equal(response.status, 401);
	const middleware = requireRole('mentee');
	const error = middleware({ user: { id: 7, role: 'mentor' } }, {}, (value) => value);
	assert.equal(error.code, 'FORBIDDEN');
});
