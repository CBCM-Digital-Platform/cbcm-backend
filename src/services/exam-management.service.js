const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const repository = require('../repositories/exams.repository');
const { toExamSummary, toExamDetails } = require('../dtos/response/exam-management.response.dto');

const roleOf = (actor) => String(actor?.role || '').toLowerCase();

async function listExams(actor) {
	const role = roleOf(actor);
	const facilityId = role === Role.FACILITY_ADMIN ? actor.facility_id : undefined;
	if (role === Role.FACILITY_ADMIN && facilityId == null) throw new AppError('Facility scope is required.', 403, 'FORBIDDEN');
	return (await repository.findExams({ facilityId })).map(toExamSummary);
}

async function getExam(examId, actor) {
	const role = roleOf(actor);
	let exam;
	if (role === Role.FACILITY_ADMIN) {
		if (actor.facility_id == null) throw new AppError('Facility scope is required.', 403, 'FORBIDDEN');
		exam = await repository.findExamDetailsById(examId, { facilityId: actor.facility_id });
	} else {
		exam = await repository.findExamDetailsById(examId);
		if (role === Role.MENTOR && exam) {
			const assignment = await repository.findMentorExamAssignment({ mentorId: actor.id, cycleId: exam.cycle_id, thematicAreaId: exam.thematic_area_id });
			if (!assignment) exam = null;
		}
	}
	if (!exam) throw new AppError('Exam was not found.', 404, 'EXAM_NOT_FOUND');
	return toExamDetails(exam);
}

module.exports = { listExams, getExam };
