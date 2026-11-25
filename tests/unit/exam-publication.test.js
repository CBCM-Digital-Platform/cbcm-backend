process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const repository = require('../../src/repositories/exams.repository');
const service = require('../../src/services/exam-publication.service');
const requireRole = require('../../src/middlewares/auth/require-role.middleware');

function setup(exam = {
	id: 12,
	title: 'Family Planning Post-Test',
	stage: 'POST_TEST',
	cycle_id: 1,
	thematic_area_id: 7,
	version: 1,
	is_published: false,
	is_authorized: false,
}) {
	const originals = {
		findExamById: repository.findExamById,
		updateExamStatus: repository.updateExamStatus,
	};
	let update;
	repository.findExamById = async () => exam;
	repository.updateExamStatus = async (_id, values) => { update = values; return [1]; };
	return { originals, getUpdate: () => update };
}

test('publishes an Exam without changing authorization state', async () => {
	const state = setup();
	try {
		const result = await service.publishExam({ examId: 12, actor: { id: 4 } });
		assert.equal(state.getUpdate().is_published, true);
		assert.equal(state.getUpdate().updated_by, 4);
		assert.equal(result.isPublished, true);
		assert.equal(result.isAuthorized, false);
	} finally { Object.assign(repository, state.originals); }
});

test('authorizes an Exam without changing publication state', async () => {
	const state = setup();
	try {
		const result = await service.authorizeExam({ examId: 12, actor: { id: 4 } });
		assert.equal(state.getUpdate().is_authorized, true);
		assert.equal(state.getUpdate().updated_by, 4);
		assert.equal(result.isPublished, false);
		assert.equal(result.isAuthorized, true);
	} finally { Object.assign(repository, state.originals); }
});

test('returns EXAM_NOT_FOUND for a missing Exam', async () => {
	const state = setup(null);
	try {
		await assert.rejects(() => service.publishExam({ examId: 999, actor: { id: 4 } }), { code: 'EXAM_NOT_FOUND' });
	} finally { Object.assign(repository, state.originals); }
});

test('publication actions are restricted to the system admin role', () => {
	const middleware = requireRole('admin');
	const next = (error) => error;
	assert.equal(middleware({ user: { role: 'admin' } }, {}, next), undefined);
	assert.equal(middleware({ user: { role: 'mentor' } }, {}, next).code, 'FORBIDDEN');
});
