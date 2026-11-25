process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseExamCsv } = require('../../src/services/exam-csv-parser.service');
const { parseExamImportMetadata } = require('../../src/validators/exam-import.validator');
const { inspectExamCsvUpload } = require('../../src/config/multer');
const requireRole = require('../../src/middlewares/auth/require-role.middleware');
const examService = require('../../src/services/exam-import.service');
const repository = require('../../src/repositories/exams.repository');
const models = require('../../src/models');

const validCsv = [
	'question,option_a,option_b,option_c,option_d,correct_answer,marks',
	'"What, exactly, is family planning?",A method to plan pregnancies,A method to treat malaria,A surgical procedure,A type of vaccine,A,1',
	'Which method is long-acting?,Implant,Paracetamol,Antibiotic,Antacid,A,2',
].join('\n');

test('Exam CSV parser accepts quoted commas and UTF-8 content', () => {
	const rows = parseExamCsv(Buffer.from(`${validCsv}\n`));
	assert.equal(rows.length, 2);
	assert.equal(rows[0].question, 'What, exactly, is family planning?');
	assert.equal(rows[0].options.A, 'A method to plan pregnancies');
	assert.equal(rows[1].marks, 2);
});

test('Exam CSV parser rejects missing headers and invalid rows with details', () => {
	assert.throws(() => parseExamCsv(Buffer.from('question,option_a\nQuestion,A\n')), (error) => {
		assert.equal(error.code, 'CSV_VALIDATION_ERROR');
		assert.ok(error.details.some((detail) => detail.field === 'option_d'));
		return true;
	});
	assert.throws(() => parseExamCsv(Buffer.from([
		'question,option_a,option_b,option_c,option_d,correct_answer,marks',
		',A,B,C,D,E,0',
	].join('\n'))), (error) => {
		assert.equal(error.code, 'CSV_VALIDATION_ERROR');
		assert.ok(error.details.some((detail) => detail.field === 'question'));
		assert.ok(error.details.some((detail) => detail.field === 'correct_answer'));
		assert.ok(error.details.some((detail) => detail.field === 'marks'));
		return true;
	});
});

test('Exam metadata and upload validation enforce stage, scope, and CSV files', () => {
	assert.deepEqual(parseExamImportMetadata({ title: ' Exam 1 ', stage: 'post_test', thematic_area_id: '2', cycle_id: '3' }), {
		title: 'Exam 1', description: null, stage: 'POST_TEST', thematicAreaId: 2, cycleId: 3, version: 1,
	});
	assert.throws(() => parseExamImportMetadata({ title: 'Exam', stage: 'PRETEST', thematic_area_id: 2, cycle_id: 3 }), { code: 'VALIDATION_ERROR' });
	assert.throws(() => inspectExamCsvUpload({ originalname: 'exam.txt', mimetype: 'text/csv', buffer: Buffer.from(validCsv) }), { code: 'FILE_TYPE_UNSUPPORTED' });
	assert.equal(inspectExamCsvUpload({ originalname: 'exam.csv', mimetype: 'text/csv', buffer: Buffer.from(validCsv) }).sizeBytes, Buffer.byteLength(validCsv));
});

test('Exam import service creates one unpublished Exam with ordered questions and four options', async () => {
	const originals = {
		transaction: models.sequelize.transaction,
		findThematicArea: repository.findThematicArea,
		findCycle: repository.findCycle,
		findCycleThematicArea: repository.findCycleThematicArea,
		findDuplicate: repository.findDuplicate,
		createExam: repository.createExam,
		createQuestion: repository.createQuestion,
		createOptions: repository.createOptions,
	};
	const created = { exams: [], questions: [], options: [] };
	models.sequelize.transaction = async (callback) => callback({ id: 'transaction' });
	repository.findThematicArea = async () => ({ id: 2, code: 'TA2', name: 'Area 2' });
	repository.findCycle = async () => ({ id: 3, name: 'Cycle 3', status: 'active' });
	repository.findCycleThematicArea = async () => ({ id: 4 });
	repository.findDuplicate = async () => null;
	repository.createExam = async (data) => { const exam = { id: 9, created_at: new Date(), ...data }; created.exams.push(exam); return exam; };
	repository.createQuestion = async (data) => { const question = { id: created.questions.length + 1, ...data }; created.questions.push(question); return question; };
	repository.createOptions = async (data) => { created.options.push(...data); return data; };
	try {
		const result = await examService.importExam({
			actor: { id: 7, role: 'admin' },
			metadata: { title: 'Imported Exam', description: null, stage: 'PRE_TEST', thematicAreaId: 2, cycleId: 3, version: 1 },
			upload: { body: Buffer.from(validCsv) },
		});
		assert.equal(result.id, 9);
		assert.equal(result.totalQuestions, 2);
		assert.equal(result.totalMarks, 3);
		assert.equal(result.isPublished, false);
		assert.deepEqual(created.questions.map((question) => question.order_number), [1, 2]);
		assert.equal(created.options.length, 8);
		assert.equal(created.options.filter((option) => option.is_correct).length, 2);
		assert.equal(created.exams[0].created_by, 7);
	} finally {
		Object.assign(models.sequelize, { transaction: originals.transaction });
		repository.findThematicArea = originals.findThematicArea;
		repository.findCycle = originals.findCycle;
		repository.findCycleThematicArea = originals.findCycleThematicArea;
		repository.findDuplicate = originals.findDuplicate;
		repository.createExam = originals.createExam;
		repository.createQuestion = originals.createQuestion;
		repository.createOptions = originals.createOptions;
	}
});

test('Exam import role policy allows only admin', () => {
	const middleware = requireRole('admin');
	const next = (error) => error;
	assert.equal(middleware({ user: { role: 'admin' } }, {}, next), undefined);
	assert.equal(middleware({ user: { role: 'mentor' } }, {}, next).code, 'FORBIDDEN');
	assert.equal(middleware({}, {}, next).code, 'UNAUTHORIZED');
});
