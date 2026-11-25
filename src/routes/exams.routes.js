const express = require('express');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const { uploadExamCsvFile } = require('../middlewares/upload.middleware');
const { parseExamImportMetadata } = require('../validators/exam-import.validator');
const { parseExamQuestionsQuery } = require('../validators/exam-import.validator');
const { parseId } = require('../validators/messaging.validator');
const Role = require('../enums/role.enum');
const controller = require('../controllers/exams.controller');

const router = express.Router();

function validateMetadata(req, res, next) {
	try {
		req.examMetadata = parseExamImportMetadata(req.body || {});
		return next();
	} catch (error) {
		return next(error);
	}
}

function validateQuestionsQuery(req, res, next) {
	try {
		req.examQuery = parseExamQuestionsQuery(req.query || {});
		return next();
	} catch (error) {
		return next(error);
	}
}

function validateExamId(req, res, next) {
	try {
		req.params.examId = parseId(req.params.examId, 'examId');
		return next();
	} catch (error) {
		return next(error);
	}
}

router.use(authenticate);
router.post('/import', requireRole(SYSTEM_ADMIN_ROLES), uploadExamCsvFile, validateMetadata, controller.importCsv);
router.post('/:examId/publish', requireRole(SYSTEM_ADMIN_ROLES), validateExamId, controller.publish);
router.post('/:examId/authorize', requireRole(SYSTEM_ADMIN_ROLES), validateExamId, controller.authorize);
router.get('/', requireRole([Role.ADMIN, Role.FACILITY_ADMIN]), controller.list);
router.get('/questions', requireRole('mentee'), validateQuestionsQuery, controller.getQuestions);
router.get('/:examId', requireRole([Role.ADMIN, Role.FACILITY_ADMIN, Role.MENTOR]), validateExamId, controller.get);

module.exports = router;
