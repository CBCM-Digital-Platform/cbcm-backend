const service = require('../services/exam-import.service');
const questionsService = require('../services/exam-questions.service');
const publicationService = require('../services/exam-publication.service');
const managementService = require('../services/exam-management.service');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');

async function importCsv(req, res) {
	try {
		const data = await service.importExam({
			actor: req.user,
			metadata: req.examMetadata,
			upload: req.examCsvUpload,
		});
		return successResponse(res, 201, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to import the Exam CSV.');
	}
}

async function getQuestions(req, res) {
	try {
		const data = await questionsService.getExamQuestions({ actor: req.user, query: req.examQuery });
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to retrieve examination questions.');
	}
}

async function publish(req, res) {
	try {
		const data = await publicationService.publishExam({ examId: req.params.examId, actor: req.user });
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to publish the Exam.');
	}
}

async function authorize(req, res) {
	try {
		const data = await publicationService.authorizeExam({ examId: req.params.examId, actor: req.user });
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, 'Unable to authorize the Exam.');
	}
}

async function list(req, res) {
	try { return successResponse(res, 200, await managementService.listExams(req.user)); }
	catch (error) { return controllerError(res, error, 'Unable to list Exams.'); }
}

async function get(req, res) {
	try { return successResponse(res, 200, await managementService.getExam(req.params.examId, req.user)); }
	catch (error) { return controllerError(res, error, 'Unable to retrieve the Exam.'); }
}

module.exports = { importCsv, getQuestions, publish, authorize, list, get };
