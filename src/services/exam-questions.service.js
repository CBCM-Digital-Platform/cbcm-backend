const AppError = require('../errors/app-error');
const repository = require('../repositories/exams.repository');
const { toExamQuestionsResponse } = require('../dtos/response/exam-questions.response.dto');

async function getExamQuestions({ actor, query }) {
	if (String(actor?.role || '').toLowerCase() !== 'mentee' || actor.facility_id == null) {
		throw new AppError('You do not have permission to retrieve examination questions.', 403, 'FORBIDDEN');
	}
	const assignment = await repository.findMenteeExamAssignment({
		menteeId: actor.id,
		cycleId: query.cycleId,
		thematicAreaId: query.thematicAreaId,
		facilityId: actor.facility_id,
	});
	if (!assignment) {
		throw new AppError('You are not assigned to this examination scope.', 403, 'EXAM_ACCESS_DENIED');
	}

	const exams = await repository.findPublishedExams(query);
	if (!exams.length) {
		throw new AppError('No eligible examination was found.', 404, 'EXAM_NOT_FOUND');
	}
	if (exams.length > 1) {
		throw new AppError('More than one published examination version matches this scope.', 409, 'AMBIGUOUS_EXAM_VERSION');
	}
	return toExamQuestionsResponse(exams[0]);
}

module.exports = { getExamQuestions };
