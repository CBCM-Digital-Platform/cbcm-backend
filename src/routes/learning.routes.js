const express = require('express');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');
const Role = require('../enums/role.enum');
const controller = require('../controllers/learning.controller');
const validator = require('../validators/learning.validator');

const router = express.Router();
const validate = (parser) => (req, res, next) => {
	try {
		req.learningInput = parser(req.body);
		return next();
	} catch (error) {
		return next(error);
	}
};

const validateId = (fieldName) => (req, res, next) => {
	try {
		if (fieldName === 'moduleId') req.params.moduleId = validator.parseId(req.params.moduleId, 'moduleId');
		if (fieldName === 'contentId') req.params.contentId = validator.parseId(req.params.contentId, 'contentId');
		if (fieldName === 'quizId') req.params.quizId = validator.parseId(req.params.quizId, 'quizId');
		if (fieldName === 'id') req.params.id = validator.parseId(req.params.id, 'id');
		if (fieldName === 'questionId') req.params.questionId = validator.parseId(req.params.questionId, 'questionId');
		if (fieldName === 'optionId') req.params.optionId = validator.parseId(req.params.optionId, 'optionId');
		if (fieldName === 'menteeId') req.params.menteeId = validator.parseId(req.params.menteeId, 'menteeId');
		if (fieldName === 'mentorId') req.params.mentorId = validator.parseId(req.params.mentorId, 'mentorId');
		return next();
	} catch (error) {
		return next(error);
	}
};

const validatePermission = (req, res, next) => {
	try {
		req.params.permission = validator.parseLearningPermission(req.params.permission);
		return next();
	} catch (error) {
		return next(error);
	}
};

router.use(authenticate);

router.get('/modules', controller.listModules);
router.post('/modules', requireRole(Role.ADMIN), validate(validator.parseModule), controller.createModule);
router.get('/modules/:id', validateId('id'), controller.getModule);
router.patch('/modules/:id', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('id'), validate(validator.parseModulePatch), controller.updateModule);
router.put('/modules/:id', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('id'), validate(validator.parseModule), controller.updateModule);
router.delete('/modules/:id', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('id'), controller.deleteModule);

router.get('/modules/:moduleId/contents', validateId('moduleId'), controller.listContents);
router.get('/modules/:moduleId/contents/:contentId', validateId('moduleId'), validateId('contentId'), controller.getContent);
router.post('/modules/:moduleId/contents', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), validate(validator.parseContent), controller.createContent);
router.patch('/modules/:moduleId/contents/:contentId', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), validateId('contentId'), validate(validator.parseContentPatch), controller.updateContent);
router.put('/modules/:moduleId/contents/:contentId', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), validateId('contentId'), validate(validator.parseContent), controller.updateContent);
router.delete('/modules/:moduleId/contents/:contentId', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), validateId('contentId'), controller.deleteContent);

router.post('/modules/:moduleId/quizzes', requireRole(Role.FACILITY_ADMIN), validateId('moduleId'), validate(validator.parseQuiz), controller.createQuiz);
router.patch('/quizzes/:quizId', requireRole(Role.FACILITY_ADMIN), validateId('quizId'), validate(validator.parseQuizPatch), controller.updateQuiz);

router.get('/modules/:moduleId/mentor-access', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), controller.getModuleMentorAccess);
router.post('/modules/:moduleId/mentor-access', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), validate(validator.parseMentorAccessGrant), controller.grantMentorModuleAccess);
router.delete('/modules/:moduleId/mentor-access/:mentorId', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), validateId('mentorId'), controller.revokeModuleMentorAccess);
router.get('/modules/:moduleId/mentor-permissions', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), controller.getModuleMentorPermissions);
router.post('/modules/:moduleId/mentor-permissions', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), validate(validator.parseMentorPermissionGrant), controller.grantModuleMentorPermission);
router.delete('/modules/:moduleId/mentor-permissions/:mentorId/:permission', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), validateId('mentorId'), validatePermission, controller.revokeModuleMentorPermission);
router.post('/modules/:moduleId/access', requireRole('mentor'), validateId('moduleId'), validate(validator.parseAccessGrant), controller.grantModuleAccess);
router.get('/modules/:moduleId/access', requireRole(FACILITY_MANAGEMENT_ROLES), validateId('moduleId'), controller.getModuleAccess);
router.delete('/modules/:moduleId/access/:menteeId', requireRole([...FACILITY_MANAGEMENT_ROLES, Role.MENTOR]), validateId('moduleId'), validateId('menteeId'), controller.revokeModuleAccess);
router.get('/mentees/:menteeId/modules', requireRole([...FACILITY_MANAGEMENT_ROLES, Role.MENTOR]), validateId('menteeId'), controller.getMenteeModules);

router.get('/my/modules', requireRole('mentee'), controller.getMyModules);
router.get('/my/modules/:moduleId', requireRole('mentee'), validateId('moduleId'), controller.getMyModuleProgress);
router.get('/my/modules/:moduleId/progress', requireRole('mentee'), validateId('moduleId'), controller.getMyModuleProgress);
router.get('/my/modules/:moduleId/contents/progress', requireRole('mentee'), validateId('moduleId'), controller.getContentProgress);
router.post('/my/modules/:moduleId/contents/:contentId/complete', requireRole('mentee'), validateId('moduleId'), validateId('contentId'), controller.completeContent);
router.post('/my/modules/:moduleId/confirm-completion', requireRole('mentee'), validateId('moduleId'), controller.confirmModuleCompletion);

router.get('/modules/:moduleId/quiz', requireRole('mentee'), validateId('moduleId'), controller.getQuizByModule);
router.get('/modules/:moduleId/quizzes', requireRole('mentee'), validateId('moduleId'), controller.getQuizByModule);
router.get('/quizzes/:quizId', requireRole('mentee'), validateId('quizId'), controller.getQuiz);
router.post('/quizzes/:quizId/start', requireRole('mentee'), validateId('quizId'), controller.startQuizAttempt);
router.post('/quizzes/:quizId/submit', requireRole('mentee'), validateId('quizId'), validate(validator.parseQuizSubmission), controller.submitQuiz);
router.get('/quizzes/:quizId/results', requireRole('mentee'), validateId('quizId'), controller.getQuizResults);
router.get('/quizzes/:quizId/attempts', requireRole('mentee'), validateId('quizId'), controller.getQuizAttempts);

router.get('/quizzes/:quizId/answer-key', requireRole([Role.FACILITY_ADMIN, Role.MENTOR]), validateId('quizId'), controller.getQuizAnswerKey);
router.post('/quizzes/:quizId/questions', requireRole(Role.FACILITY_ADMIN), validateId('quizId'), validate(validator.parseQuestion), controller.createQuizQuestion);
router.get('/quizzes/:quizId/questions', requireRole([Role.FACILITY_ADMIN, Role.MENTOR]), validateId('quizId'), controller.listQuizQuestions);
router.put('/quizzes/:quizId/questions/:questionId', requireRole(Role.FACILITY_ADMIN), validateId('quizId'), validateId('questionId'), validate(validator.parseQuestion), controller.updateQuizQuestion);
router.delete('/quizzes/:quizId/questions/:questionId', requireRole(Role.FACILITY_ADMIN), validateId('quizId'), validateId('questionId'), controller.deleteQuizQuestion);

router.post('/questions/:questionId/options', requireRole(Role.FACILITY_ADMIN), validateId('questionId'), validate(validator.parseOption), controller.createQuestionOption);
router.put('/questions/:questionId/options/:optionId', requireRole(Role.FACILITY_ADMIN), validateId('questionId'), validateId('optionId'), validate(validator.parseOption), controller.updateQuestionOption);
router.delete('/questions/:questionId/options/:optionId', requireRole(Role.FACILITY_ADMIN), validateId('questionId'), validateId('optionId'), controller.deleteQuestionOption);

module.exports = router;
