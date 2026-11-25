const AppError = require('../errors/app-error');
const repository = require('../repositories/exams.repository');
const { toExamPublicationResponse } = require('../dtos/response/exam-publication.response.dto');

async function updatePublication({ examId, actor, field }) {
	const exam = await repository.findExamById(examId);
	if (!exam) {
		throw new AppError('Exam was not found.', 404, 'EXAM_NOT_FOUND');
	}

	const values = { [field]: true, updated_by: actor.id };
	await repository.updateExamStatus(examId, values);
	return toExamPublicationResponse({ ...exam.toJSON ? exam.toJSON() : exam, ...values });
}

async function publishExam({ examId, actor }) {
	return updatePublication({ examId, actor, field: 'is_published' });
}

async function authorizeExam({ examId, actor }) {
	return updatePublication({ examId, actor, field: 'is_authorized' });
}

module.exports = { publishExam, authorizeExam };
