const { sequelize } = require('../models');
const AppError = require('../errors/app-error');
const repository = require('../repositories/exams.repository');
const { parseExamCsv } = require('./exam-csv-parser.service');
const { toExamImportResponse } = require('../dtos/response/exam-import.response.dto');

function mapDatabaseError(error) {
	if (error?.name === 'SequelizeUniqueConstraintError') {
		return new AppError('An Exam already exists for this thematic area, cycle, stage, and version.', 409, 'EXAM_ALREADY_EXISTS');
	}
	return error;
}

async function importExam({ actor, metadata, upload }) {
	const rows = parseExamCsv(upload?.body);
	let response;
	try {
		response = await sequelize.transaction(async (transaction) => {
			const [thematicArea, cycle, assignment] = await Promise.all([
				repository.findThematicArea(metadata.thematicAreaId, { transaction }),
				repository.findCycle(metadata.cycleId, { transaction }),
				repository.findCycleThematicArea(metadata.cycleId, metadata.thematicAreaId, transaction),
			]);
			if (!thematicArea) throw new AppError('Thematic area was not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
			if (!cycle) throw new AppError('Mentorship cycle was not found.', 404, 'CYCLE_NOT_FOUND');
			if (!assignment) throw new AppError('Thematic area is not assigned to the mentorship cycle.', 400, 'INVALID_CYCLE_THEMATIC_AREA');

			if (await repository.findDuplicate(metadata, transaction)) {
				throw new AppError('An Exam already exists for this thematic area, cycle, stage, and version.', 409, 'EXAM_ALREADY_EXISTS');
			}

			const exam = await repository.createExam({
				title: metadata.title,
				description: metadata.description,
				stage: metadata.stage,
				thematic_area_id: metadata.thematicAreaId,
				cycle_id: metadata.cycleId,
				version: metadata.version,
				total_questions: rows.length,
				total_marks: rows.reduce((sum, row) => sum + row.marks, 0),
				is_published: false,
				is_authorized: false,
				created_by: actor.id,
				updated_by: actor.id,
			}, transaction);

			for (let index = 0; index < rows.length; index += 1) {
				const row = rows[index];
				const question = await repository.createQuestion({
					exam_id: exam.id,
					question_text: row.question,
					question_type: 'single_choice',
					marks: row.marks,
					order_number: index + 1,
				}, transaction);
				await repository.createOptions(['A', 'B', 'C', 'D'].map((label) => ({
					question_id: question.id,
					option_label: label,
					option_text: row.options[label],
					is_correct: row.correctAnswer === label,
				})), transaction);
			}

			return toExamImportResponse(exam, { thematicArea, cycle, rowCount: rows.length });
		});
	} catch (error) {
		throw mapDatabaseError(error);
	}
	return response;
}

module.exports = { importExam };
