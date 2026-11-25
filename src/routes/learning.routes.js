const express = require('express');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const Role = require('../enums/role.enum');
const controller = require('../controllers/learning.controller');
const resourcesController = require('../controllers/resources.controller');
const validator = require('../validators/learning.validator');
const resourceValidator = require('../validators/resources.validator');
const { uploadQuizPdfs } = require('../middlewares/upload.middleware');

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
		if (fieldName === 'thematicAreaId') req.params.thematicAreaId = validator.parseId(req.params.thematicAreaId, 'thematicAreaId');
		if (fieldName === 'quizId') req.params.quizId = validator.parseId(req.params.quizId, 'quizId');
		if (fieldName === 'id') req.params.id = validator.parseId(req.params.id, 'id');
		if (fieldName === 'questionId') req.params.questionId = validator.parseId(req.params.questionId, 'questionId');
		if (fieldName === 'optionId') req.params.optionId = validator.parseId(req.params.optionId, 'optionId');
		if (fieldName === 'menteeId') req.params.menteeId = validator.parseId(req.params.menteeId, 'menteeId');
		if (fieldName === 'mentorId') req.params.mentorId = validator.parseId(req.params.mentorId, 'mentorId');
		if (fieldName === 'resourceId') req.params.resourceId = validator.parseId(req.params.resourceId, 'resourceId');
		if (fieldName === 'applicationId') req.params.applicationId = validator.parseId(req.params.applicationId, 'applicationId');
		if (fieldName === 'assignmentId') req.params.assignmentId = validator.parseId(req.params.assignmentId, 'assignmentId');
		return next();
	} catch (error) {
		return next(error);
	}
};

router.use(authenticate);

router.get('/modules', controller.listModules);
router.post('/modules', requireRole(Role.ADMIN), validate(validator.parseModule), controller.createModule);
router.get('/modules/:id', validateId('id'), controller.getModule);
router.patch('/modules/:id', requireRole(Role.ADMIN), validateId('id'), validate(validator.parseModulePatch), controller.updateModule);
router.put('/modules/:id', requireRole(Role.ADMIN), validateId('id'), validate(validator.parseModule), controller.updateModule);
router.delete('/modules/:id', requireRole(Role.ADMIN), validateId('id'), controller.deleteModule);

router.post('/modules/:moduleId/quizzes', requireRole(Role.ADMIN), validateId('moduleId'), validate(validator.parseQuiz), controller.createQuiz);
router.post('/thematic-areas/:thematicAreaId/quiz', requireRole(Role.ADMIN), validateId('thematicAreaId'), validate(validator.parseThematicAreaQuiz), controller.createThematicAreaQuiz);
router.get('/thematic-areas/:thematicAreaId/quiz', requireRole([Role.ADMIN, Role.FACILITY_ADMIN, Role.MENTOR, Role.MENTEE]), validateId('thematicAreaId'), controller.getQuizByThematicArea);
router.patch('/quizzes/:quizId', requireRole(Role.ADMIN), validateId('quizId'), validate(validator.parseQuizPatch), controller.updateQuiz);

router.get('/my/modules', requireRole('mentee'), controller.getMyModules);
router.get('/my/modules/:moduleId', requireRole('mentee'), validateId('moduleId'), controller.getMyModuleProgress);
router.get('/my/modules/:moduleId/progress', requireRole('mentee'), validateId('moduleId'), controller.getMyModuleProgress);
router.get('/my/modules/:moduleId/resources/progress', requireRole('mentee'), validateId('moduleId'), controller.getResourceProgress);
router.post('/my/modules/:moduleId/confirm-completion', requireRole('mentee'), validateId('moduleId'), controller.confirmModuleCompletion);

router.post(
	'/modules/:moduleId/resources/:resourceId/assignments',
	requireRole(Role.MENTOR),
	validateId('moduleId'),
	validateId('resourceId'),
	validate(resourceValidator.parseResourceAssignment),
	resourcesController.assignToMenteeInModule
);
router.get(
	'/modules/:moduleId/resources/:resourceId/assignments',
	requireRole(Role.MENTOR),
	validateId('moduleId'),
	validateId('resourceId'),
	resourcesController.listModuleResourceAssignments
);
router.get('/mentees/:menteeId/resources', requireRole(Role.MENTOR), validateId('menteeId'), resourcesController.listMenteeAssignments);
router.post(
	'/resource-assignments/:assignmentId/revoke',
	requireRole([Role.ADMIN, Role.FACILITY_ADMIN, Role.MENTOR]),
	validateId('assignmentId'),
	resourcesController.revokeAssignment
);
router.get('/my/resources', requireRole(Role.MENTEE), resourcesController.listMyAssignments);
router.get('/my/resources/:resourceId', requireRole(Role.MENTEE), validateId('resourceId'), resourcesController.getMyResource);
router.get('/my/resources/:resourceId/content', requireRole(Role.MENTEE), validateId('resourceId'), resourcesController.downloadMyResource);
router.post('/my/resources/:resourceId/complete', requireRole(Role.MENTEE), validateId('resourceId'), resourcesController.completeMyResource);

router.get('/modules/:moduleId/quiz', requireRole('mentee'), validateId('moduleId'), controller.getQuizByModule);
router.get('/modules/:moduleId/quizzes', requireRole([Role.ADMIN, Role.FACILITY_ADMIN, Role.MENTOR, Role.MENTEE]), validateId('moduleId'), controller.getQuizByModuleForViewer);
router.get('/quizzes/:quizId', requireRole('mentee'), validateId('quizId'), controller.getQuiz);
router.post('/quizzes/:quizId/start', requireRole('mentee'), validateId('quizId'), controller.startQuizAttempt);
router.post('/quizzes/:quizId/submit', requireRole('mentee'), validateId('quizId'), validate(validator.parseQuizSubmission), controller.submitQuiz);
router.get('/quizzes/:quizId/results', requireRole('mentee'), validateId('quizId'), controller.getQuizResults);
router.get('/quizzes/:quizId/attempts', requireRole('mentee'), validateId('quizId'), controller.getQuizAttempts);

router.get('/quizzes/:quizId/answer-key', requireRole([Role.ADMIN, Role.FACILITY_ADMIN, Role.MENTOR]), validateId('quizId'), controller.getQuizAnswerKey);
router.post('/quizzes/:quizId/questions', requireRole(Role.ADMIN), validateId('quizId'), validate(validator.parseQuestion), controller.createQuizQuestion);
router.get('/quizzes/:quizId/questions', requireRole([Role.ADMIN, Role.FACILITY_ADMIN, Role.MENTOR]), validateId('quizId'), controller.listQuizQuestions);
router.put('/quizzes/:quizId/questions/:questionId', requireRole(Role.ADMIN), validateId('quizId'), validateId('questionId'), validate(validator.parseQuestion), controller.updateQuizQuestion);
router.delete('/quizzes/:quizId/questions/:questionId', requireRole(Role.ADMIN), validateId('quizId'), validateId('questionId'), controller.deleteQuizQuestion);

router.post('/questions/:questionId/options', requireRole(Role.ADMIN), validateId('questionId'), validate(validator.parseOption), controller.createQuestionOption);
router.put('/questions/:questionId/options/:optionId', requireRole(Role.ADMIN), validateId('questionId'), validateId('optionId'), validate(validator.parseOption), controller.updateQuestionOption);
router.delete('/questions/:questionId/options/:optionId', requireRole(Role.ADMIN), validateId('questionId'), validateId('optionId'), controller.deleteQuestionOption);

router.post('/modules/:moduleId/quiz-imports', requireRole(Role.ADMIN), validateId('moduleId'), uploadQuizPdfs, controller.createQuizImport);
router.post('/thematic-areas/:thematicAreaId/quiz-imports', requireRole(Role.ADMIN), validateId('thematicAreaId'), uploadQuizPdfs, controller.createThematicAreaQuizImport);
router.post('/quiz-imports/:draftId/extract', requireRole(Role.ADMIN), validateId('draftId'), controller.extractQuizImport);
router.get('/quiz-imports/:draftId', requireRole(Role.ADMIN), validateId('draftId'), controller.getQuizImport);
router.put('/quiz-imports/:draftId/questions/:questionIndex', requireRole(Role.ADMIN), validateId('draftId'), controller.updateQuizImportQuestion);
router.delete('/quiz-imports/:draftId/questions/:questionIndex', requireRole(Role.ADMIN), validateId('draftId'), controller.deleteQuizImportQuestion);
router.post('/quiz-imports/:draftId/confirm', requireRole(Role.ADMIN), validateId('draftId'), controller.confirmQuizImport);
router.post('/resources/:resourceId/answer-key-applications', requireRole(Role.ADMIN), validateId('resourceId'), controller.startAnswerKeyApplication);
router.post('/answer-key-applications/:applicationId/extract', requireRole(Role.ADMIN), validateId('applicationId'), controller.extractAnswerKeyApplication);

module.exports = router;
