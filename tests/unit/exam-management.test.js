process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const repository = require('../../src/repositories/exams.repository');
const service = require('../../src/services/exam-management.service');

const exam = {
	id: 12, title: 'Exam', description: null, stage: 'POST_TEST', cycle_id: 1, thematic_area_id: 7,
	version: 1, total_questions: 1, total_marks: 1, is_published: true, is_authorized: true,
	cycle: { id: 1, name: 'Cycle 1', status: 'active' },
	thematicArea: { id: 7, code: 'FP', name: 'Family Planning' },
	questions: [{ id: 101, question_text: 'Question', question_type: 'single_choice', marks: 1, order_number: 1, options: [{ id: 1001, option_label: 'A', option_text: 'Option A', is_correct: true }] }],
};

function stubRepository({ exams = [exam], detail = exam, assignment = { id: 3 } } = {}) {
	const originals = {
		findExams: repository.findExams,
		findExamDetailsById: repository.findExamDetailsById,
		findMentorExamAssignment: repository.findMentorExamAssignment,
	};
	let listScope;
	repository.findExams = async (scope) => { listScope = scope; return exams; };
	repository.findExamDetailsById = async () => detail;
	repository.findMentorExamAssignment = async () => assignment;
	return { originals, getListScope: () => listScope };
}

test('Admin can list Exams', async () => {
	const state = stubRepository();
	try {
		const result = await service.listExams({ id: 1, role: 'admin' });
		assert.equal(result[0].id, 12);
		assert.equal(state.getListScope().facilityId, undefined);
	} finally { Object.assign(repository, state.originals); }
});

test('Facility Admin listing is restricted to their facility', async () => {
	const state = stubRepository();
	try {
		await service.listExams({ id: 2, role: 'facility_admin', facility_id: 9 });
		assert.equal(state.getListScope().facilityId, 9);
	} finally { Object.assign(repository, state.originals); }
});

test('authorized management detail returns ordered safe options without answer flags', async () => {
	const state = stubRepository();
	try {
		const result = await service.getExam(12, { id: 1, role: 'admin' });
		assert.equal(result.questions[0].options[0].label, 'A');
		assert.equal(Object.hasOwn(result.questions[0].options[0], 'is_correct'), false);
	} finally { Object.assign(repository, state.originals); }
});

test('Mentor detail requires an active matching assignment', async () => {
	const state = stubRepository({ assignment: null });
	try {
		await assert.rejects(() => service.getExam(12, { id: 4, role: 'mentor' }), { code: 'EXAM_NOT_FOUND' });
	} finally { Object.assign(repository, state.originals); }
});

test('missing Exam detail returns EXAM_NOT_FOUND', async () => {
	const state = stubRepository({ detail: null });
	try {
		await assert.rejects(() => service.getExam(999, { id: 1, role: 'admin' }), { code: 'EXAM_NOT_FOUND' });
	} finally { Object.assign(repository, state.originals); }
});
