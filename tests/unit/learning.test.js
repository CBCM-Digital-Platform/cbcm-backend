process.env.JWT_SECRET = 'learning-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const validator = require('../../src/validators/learning.validator');
const service = require('../../src/services/learning.service');
const repository = require('../../src/repositories/learning.repository');
const notificationService = require('../../src/services/notifications.service');
const NotificationType = require('../../src/enums/notification-type.enum');
const models = require('../../src/models');

const restore = (target, key, value) => {
  target[key] = value;
};

test('learning module validation rejects empty titles and invalid ids', () => {
  assert.throws(() => validator.parseModule({ title: '   ' }), { statusCode: 400 });
  assert.throws(() => validator.parseModule({ title: 'Module 1', estimatedDurationMinutes: 'nope' }), { statusCode: 400 });
  assert.equal(validator.parseId('2', 'moduleId'), 2);
  assert.throws(() => validator.parseId('0', 'moduleId'), { statusCode: 400 });
});

test('learning service rejects missing module ids and empty payloads', async () => {
  const original = repository.getModuleById;
  repository.getModuleById = async () => null;
  try {
    await assert.rejects(service.getModule(22), { statusCode: 404 });
    await assert.rejects(service.createModule({ title: '' }), { statusCode: 400 });
  } finally {
    repository.getModuleById = original;
  }
});

test('learning service ensures title trimming for create and update', async () => {
  const originalCreate = repository.createModule;
  const originalGet = repository.getModuleById;
  let createdPayload;
  repository.createModule = async (payload) => {
    createdPayload = payload;
    return { id: 10, ...payload };
  };
  repository.getModuleById = async (moduleId) => ({ id: moduleId, status: 'draft', is_published: false, is_authorized: false });

  try {
    const created = await service.createModule({ title: '  Intro to CBCM  ' });
    assert.equal(created.title, 'Intro to CBCM');
    assert.deepEqual(createdPayload.title, 'Intro to CBCM');

    const originalUpdate = repository.updateModule;
    const originalNotification = notificationService.createNotifications;
    repository.updateModule = async (moduleId, payload) => {
      assert.equal(moduleId, 3);
      assert.equal(payload.title, 'Updated title');
      return { id: moduleId, title: 'Updated title' };
    };
    notificationService.createNotifications = async () => [];
    try {
      const updated = await service.updateModule(3, { title: '  Updated title  ' });
      assert.equal(updated.title, 'Updated title');
    } finally {
      repository.updateModule = originalUpdate;
      notificationService.createNotifications = originalNotification;
    }
  } finally {
    repository.createModule = originalCreate;
    repository.getModuleById = originalGet;
  }
});

test('publishing a module notifies only mentees with access after the update succeeds', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    updateModule: repository.updateModule,
    listModuleProgress: repository.listModuleProgress,
    createNotifications: notificationService.createNotifications,
  };
  const actions = [];
  let notificationInput;
  repository.getModuleById = async (id) => ({
    id,
    title: 'Module A',
    status: 'draft',
    is_published: false,
    is_authorized: true,
  });
  repository.updateModule = async (id) => {
    actions.push('update');
    return {
      id,
      title: 'Module A',
      status: 'published',
      is_published: true,
      is_authorized: true,
    };
  };
  repository.listModuleProgress = async () => {
    actions.push('access');
    return [{ mentee_id: 8 }, { mentee_id: 9 }];
  };
  notificationService.createNotifications = async (input) => {
    actions.push('notification');
    notificationInput = input;
  };

  try {
    await service.updateModule(3, { status: 'published', isPublished: true });
    assert.deepEqual(actions, ['update', 'access', 'notification']);
    assert.deepEqual(notificationInput, {
      userIds: [8, 9],
      type: NotificationType.LEARNING_MODULE_PUBLISHED,
      title: 'Learning module published',
      body: 'Module A is now available.',
      referenceType: 'learning_module',
      referenceId: 3,
    });
  } finally {
    Object.assign(repository, originals);
  }
});

test('granting module access notifies the mentee only for a new active assignment', async () => {
  const originals = {
    isMentee: repository.isMentee,
    isMentor: repository.isMentor,
    hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
    hasModuleMentorAccess: repository.hasModuleMentorAccess,
    getModuleById: repository.getModuleById,
    getModuleProgress: repository.getModuleProgress,
    grantModuleAccess: repository.grantModuleAccess,
    createNotification: notificationService.createNotification,
  };
  const calls = [];
  repository.isMentee = async () => true;
  repository.isMentor = async () => true;
  repository.hasActiveMentorAssignment = async () => true;
  repository.hasModuleMentorAccess = async () => true;
  repository.getModuleById = async (id) => ({
    id,
    title: 'Module A',
    status: 'published',
    is_published: true,
    is_authorized: true,
  });
  repository.getModuleProgress = async () => null;
  repository.grantModuleAccess = async () => {
    calls.push('assignment');
    return { mentee_id: 8, module_id: 3 };
  };
  notificationService.createNotification = async (input) => {
    calls.push('notification');
    calls.push(input);
  };

  try {
    await service.grantModuleAccess({ menteeId: 8, moduleId: 3, mentorId: 2 });
    assert.deepEqual(calls, [
      'assignment',
      'notification',
      {
        userId: 8,
        type: NotificationType.LEARNING_MODULE_ASSIGNED,
        title: 'Learning module assigned',
        body: 'You have been assigned the learning module "Module A".',
        referenceType: 'learning_module',
        referenceId: 3,
      },
    ]);
  } finally {
    Object.assign(repository, originals);
  }
});

test('admins cannot grant module access directly to mentees', async () => {
  const originals = {
    isMentee: repository.isMentee,
    isMentor: repository.isMentor,
    grantModuleAccess: repository.grantModuleAccess,
  };
  repository.isMentee = async () => true;
  repository.isMentor = async () => false;
  repository.grantModuleAccess = async () => {
    throw new Error('admin must not directly assign a module to a mentee');
  };
  try {
    await assert.rejects(
      service.grantModuleAccess({ menteeId: 8, moduleId: 3, mentorId: 2 }),
      { statusCode: 403 }
    );
  } finally {
    Object.assign(repository, originals);
  }
});

test('admins can grant only published and authorized modules to mentors', async () => {
  const originals = {
    isLearningAdmin: repository.isLearningAdmin,
    isMentor: repository.isMentor,
    getModuleById: repository.getModuleById,
    grantMentorModuleAccess: repository.grantMentorModuleAccess,
  };
  let grantInput;
  repository.isLearningAdmin = async () => true;
  repository.isMentor = async () => true;
  repository.getModuleById = async () => ({
    id: 3,
    status: 'published',
    is_published: true,
    is_authorized: true,
  });
  repository.grantMentorModuleAccess = async (input) => {
    grantInput = input;
    return input;
  };
  try {
    await service.grantMentorModuleAccess({ moduleId: 3, mentorId: 8, grantedBy: 2 });
    assert.deepEqual(grantInput, { moduleId: 3, mentorId: 8, grantedBy: 2 });
  } finally {
    Object.assign(repository, originals);
  }
});

test('mentors can retrieve only modules explicitly granted by an admin', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    hasModuleMentorAccess: repository.hasModuleMentorAccess,
  };
  repository.getModuleById = async (id) => ({
    id,
    status: 'published',
    is_published: true,
    is_authorized: true,
  });
  repository.hasModuleMentorAccess = async () => false;
  try {
    await assert.rejects(
      service.getModule(3, { role: 'mentor', userId: 8 }),
      { statusCode: 403 }
    );
  } finally {
    Object.assign(repository, originals);
  }
});

test('mentor module listings are restricted to module grants from admins', async () => {
  const originals = {
    listMentorModuleIds: repository.listMentorModuleIds,
    listModules: repository.listModules,
  };
  let listFilters;
  repository.listMentorModuleIds = async (mentorId) => {
    assert.equal(mentorId, 8);
    return [3];
  };
  repository.listModules = async (filters) => {
    listFilters = filters;
    return [];
  };
  try {
    await service.listModules({ mentorId: 8, publishedOnly: true, authorizedOnly: true });
    assert.deepEqual(listFilters, {
      mentorId: 8,
      publishedOnly: true,
      authorizedOnly: true,
      moduleIds: [3],
    });
  } finally {
    Object.assign(repository, originals);
  }
});

test('learning quiz submission requires publication, access, and confirmation before scoring', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    getQuizById: repository.getQuizById,
    getModuleProgress: repository.getModuleProgress,
    listRequiredContents: repository.listRequiredContents,
    countCompletedRequiredContents: repository.countCompletedRequiredContents,
    submitQuiz: repository.submitQuiz,
  };
  const originalCreateNotification = notificationService.createNotification;
  let notification;
  repository.getModuleById = async (id) => ({ id, status: 'published', is_published: true, is_authorized: true });
  repository.getQuizById = async (id) => ({ id, module_id: 4, is_published: true, is_authorized: true });
  repository.getModuleProgress = async () => ({ status: 'completed' });
  repository.listRequiredContents = async () => [{ id: 1 }];
  repository.countCompletedRequiredContents = async () => 1;
  repository.submitQuiz = async ({ quizId, menteeId, answers }) => ({
    id: 9,
    quizId,
    menteeId,
    score: 2,
    totalPoints: 3,
    passed: true,
    status: 'completed',
    submittedAt: new Date(),
    answers,
  });
  notificationService.createNotification = async (input) => { notification = input; };

  try {
    const result = await service.submitQuiz({
      quizId: 17,
      menteeId: 4,
      answers: [{ questionId: 1, selectedOptionIds: [2] }],
    });
    assert.equal(result.quizId, 17);
    assert.equal(result.menteeId, 4);
    assert.equal(result.passed, true);
    assert.deepEqual(notification, {
      userId: 4,
      type: NotificationType.QUIZ_RESULT_FINALIZED,
      title: 'Quiz result finalized',
      body: 'Your quiz result is finalized: 2/3 points.',
      referenceType: 'quiz_attempt',
      referenceId: 9,
    });
  } finally {
    Object.assign(repository, originals);
    notificationService.createNotification = originalCreateNotification;
  }
});

test('route access validation for quiz and content ids is enforced before service access', () => {
  assert.throws(() => validator.parseId('abc', 'quizId'), { statusCode: 400 });
  assert.deepEqual(validator.parseQuizSubmission({ answers: [{ questionId: '5', selectedOptionIds: [1, 2] }] }).answers[0], {
    questionId: 5,
    selectedOptionId: null,
    selectedOptionIds: [1, 2],
  });
});

test('learning routes expose the required aliases and omit the undefined hint endpoint', () => {
  const router = require('../../src/routes/learning.routes');
  const registered = router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`));
  const expected = [
    'PUT /modules/:id',
    'GET /modules/:moduleId/contents/:contentId',
    'PUT /modules/:moduleId/contents/:contentId',
    'GET /mentees/:menteeId/modules',
    'GET /modules/:moduleId/access',
    'DELETE /modules/:moduleId/access/:menteeId',
    'GET /modules/:moduleId/mentor-access',
    'POST /modules/:moduleId/mentor-access',
    'DELETE /modules/:moduleId/mentor-access/:mentorId',
    'GET /modules/:moduleId/mentor-permissions',
    'POST /modules/:moduleId/mentor-permissions',
    'DELETE /modules/:moduleId/mentor-permissions/:mentorId/:permission',
    'GET /quizzes/:quizId/answer-key',
    'POST /modules/:moduleId/access',
    'POST /modules/:moduleId/quizzes',
    'PATCH /quizzes/:quizId',
    'GET /my/modules/:moduleId/progress',
    'GET /my/modules/:moduleId/contents/progress',
    'GET /modules/:moduleId/quiz',
    'GET /quizzes/:quizId/results',
    'GET /quizzes/:quizId/attempts',
    'POST /quizzes/:quizId/questions',
    'PUT /quizzes/:quizId/questions/:questionId',
    'POST /questions/:questionId/options',
    'PUT /questions/:questionId/options/:optionId',
  ];
  for (const route of expected) assert.ok(registered.includes(route), `${route} should be registered`);
  assert.ok(!registered.some((route) => route.includes('/hint')));
});

test('facility admins manage quizzes and mentors need answer-key permission to view questions', async () => {
  const originals = {
    getQuizById: repository.getQuizById,
    getModuleById: repository.getModuleById,
    isModuleInFacilityScope: repository.isModuleInFacilityScope,
    listQuizQuestions: repository.listQuizQuestions,
    hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
    hasModuleMentorPermission: repository.hasModuleMentorPermission,
    hasModuleMentorAccess: repository.hasModuleMentorAccess,
  };
  const quiz = {
    id: 4,
    module_id: 3,
    status: 'published',
    is_published: true,
    is_authorized: true,
    questions: [],
  };
  repository.getQuizById = async () => quiz;
  repository.getModuleById = async () => ({ id: 3, status: 'published', is_published: true, is_authorized: true });
  repository.isModuleInFacilityScope = async () => true;
  repository.listQuizQuestions = async () => [{ id: 9, prompt: 'First priority?' }];
  repository.hasActiveMentorAssignment = async () => true;
  repository.hasModuleMentorPermission = async ({ permission }) => permission === 'learning.quiz.answer_key.view';
  repository.hasModuleMentorAccess = async () => false;
  try {
    const questions = await service.listQuizQuestions(4, { id: 7, role: 'facility_admin', facility_id: 1 });
    assert.equal(questions[0].id, 9);
    await service.listQuizQuestions(4, { id: 8, role: 'mentor' });
    await assert.rejects(
      service.createQuiz({ moduleId: 3, title: 'Check', actor: { id: 1, role: 'admin' } }),
      { statusCode: 403 }
    );
    repository.hasModuleMentorPermission = async () => false;
    await assert.rejects(
      service.listQuizQuestions(4, { id: 8, role: 'mentor' }),
      { statusCode: 403 }
    );
  } finally {
    Object.assign(repository, originals);
  }
});

test('quiz create can include existing A-D choices without changing option storage', () => {
  const quiz = validator.parseQuiz({
    title: 'Check',
    questions: [{
      prompt: 'First priority?',
      choices: { A: 'Wait', B: 'Assess', C: 'Discharge', D: 'Delay' },
      correctAnswer: 'B',
    }],
  });
  assert.equal(quiz.questions[0].options.length, 4);
  assert.deepEqual(quiz.questions[0].options.map((option) => option.orderNumber), [0, 1, 2, 3]);
  assert.equal(quiz.questions[0].options[1].isCorrect, true);
  assert.equal(validator.parseOption({ text: 'Assess', label: 'B', isCorrect: true }).orderNumber, 1);
  assert.equal(validator.parseQuiz({ title: 'Empty quiz' }).questions, undefined);
});

test('learning validators preserve false booleans and reject malformed answer IDs', () => {
  assert.equal(validator.parseModule({ title: 'Intro', isPublished: 'false' }).isPublished, false);
  assert.equal(validator.parseModule({ title: 'Intro', isAuthorized: 'false' }).isAuthorized, false);
  assert.equal(validator.parseContent({ title: 'Reading', isRequired: false }).isRequired, false);
  assert.equal(validator.parseContent({ title: 'Reading', isPublished: false, isAuthorized: false }).isAuthorized, false);
  assert.equal(validator.parseQuiz({ title: 'Check', isPublished: true, isAuthorized: false }).isAuthorized, false);
  assert.deepEqual(validator.parseMentorAccessGrant({ mentorId: '12' }), { mentorId: 12 });
  assert.throws(() => validator.parseMentorAccessGrant({ mentorId: 'bad' }), { statusCode: 400 });
  assert.throws(() => validator.parseContent({ title: 'Reading', isRequired: 'sometimes' }), { statusCode: 400 });
  assert.throws(() => validator.parseQuizSubmission({ answers: [{ questionId: 2, selectedOptionId: 'bad' }] }), { statusCode: 400 });
});

test('learning publication patches change only the fields explicitly supplied', () => {
  assert.deepEqual(validator.parseModulePatch({ isAuthorized: true }), { isAuthorized: true });
  assert.deepEqual(validator.parseContentPatch({ isPublished: true }), { isPublished: true });
  assert.deepEqual(validator.parseQuizPatch({ isAuthorized: true }), { isAuthorized: true });
  assert.throws(() => validator.parseModulePatch({}), { statusCode: 400 });
});

test('only published and authorized modules can be assigned to mentees', async () => {
  const originals = {
    isMentee: repository.isMentee,
    isMentor: repository.isMentor,
    getModuleById: repository.getModuleById,
    grantModuleAccess: repository.grantModuleAccess,
  };
  repository.isMentee = async () => true;
  repository.isMentor = async () => true;
  repository.getModuleById = async () => ({ id: 3, status: 'published', is_published: true, is_authorized: false });
  repository.grantModuleAccess = async () => {
    throw new Error('must not assign an unapproved module');
  };
  try {
    await assert.rejects(
      service.grantModuleAccess({ menteeId: 8, moduleId: 3, mentorId: 2 }),
      { statusCode: 409 }
    );
  } finally {
    Object.assign(repository, originals);
  }
});

test('mentees cannot mark unpublished or unauthorized content complete', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    getContentById: repository.getContentById,
    getModuleProgress: repository.getModuleProgress,
    completeContentAndUpdateProgress: repository.completeContentAndUpdateProgress,
  };
  repository.getModuleById = async (id) => ({ id, status: 'published', is_published: true, is_authorized: true });
  repository.getContentById = async (id) => ({
    id,
    module_id: 3,
    is_published: true,
    is_authorized: false,
  });
  repository.getModuleProgress = async () => ({ status: 'in_progress' });
  repository.completeContentAndUpdateProgress = async () => {
    throw new Error('must not complete unapproved material');
  };
  try {
    await assert.rejects(
      service.completeContent({ menteeId: 8, moduleId: 3, contentId: 9 }),
      { statusCode: 403 }
    );
  } finally {
    Object.assign(repository, originals);
  }
});

test('quiz remains locked until every required item is completed and confirmed', async () => {
  const originals = {
    getQuizById: repository.getQuizById,
    getModuleById: repository.getModuleById,
    getModuleProgress: repository.getModuleProgress,
    listRequiredContents: repository.listRequiredContents,
    countCompletedRequiredContents: repository.countCompletedRequiredContents,
  };
  repository.getQuizById = async () => ({ id: 7, module_id: 3, is_published: true, is_authorized: true });
  repository.getModuleById = async () => ({ id: 3, status: 'published', is_published: true, is_authorized: true });
  repository.getModuleProgress = async () => ({ status: 'in_progress' });
  repository.listRequiredContents = async () => [{ id: 1 }, { id: 2 }];
  repository.countCompletedRequiredContents = async () => 2;
  try {
    await assert.rejects(
      service.getQuiz(7, 8),
      { statusCode: 409 }
    );
  } finally {
    Object.assign(repository, originals);
  }
});

test('learning completion confirmation rejects modules with unfinished required content', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    listRequiredContents: repository.listRequiredContents,
    countCompletedRequiredContents: repository.countCompletedRequiredContents,
    getModuleProgress: repository.getModuleProgress,
  };
  repository.getModuleById = async (id) => ({ id, status: 'published', is_published: true, is_authorized: true });
  repository.listRequiredContents = async () => [{ id: 1 }, { id: 2 }];
  repository.countCompletedRequiredContents = async () => 1;
  repository.getModuleProgress = async () => ({ status: 'in_progress' });
  try {
    await assert.rejects(
      service.confirmModuleCompletion({ menteeId: 4, moduleId: 8 }),
      { statusCode: 409 }
    );
  } finally {
    Object.assign(repository, originals);
  }
});

test('learning quiz persistence stores multi-select answers once per question and isolates attempts', async () => {
  await models.sequelize.sync({ force: true });
  const admin = await models.User.create({ full_name: 'Learning Admin', email: 'learning-admin@example.test', role: 'admin', status: 'active' });
  const mentor = await models.User.create({ full_name: 'Learning Mentor', email: 'learning-mentor@example.test', role: 'mentor', status: 'active' });
  const mentee = await models.User.create({ full_name: 'Mentee', email: 'mentee-learning@example.test', role: 'mentee', status: 'active' });
  const otherMentee = await models.User.create({ full_name: 'Other Mentee', email: 'other-learning@example.test', role: 'mentee', status: 'active' });
  const moduleRecord = await models.LearningModule.create({
    title: 'Learning integration test',
    status: 'published',
    is_published: true,
    is_authorized: true,
  });
  await models.LearningModuleMentorAccess.create({
    module_id: moduleRecord.id,
    mentor_id: mentor.id,
    granted_by: admin.id,
    granted_at: new Date(),
  });
  await models.Assignment.create({ mentor_id: mentor.id, mentee_id: mentee.id, status: 'active' });
  await repository.grantModuleAccess({ menteeId: otherMentee.id, moduleId: moduleRecord.id, mentorId: admin.id });
  assert.equal(await repository.getModuleProgress({ menteeId: otherMentee.id, moduleId: moduleRecord.id }), null);
  assert.equal((await repository.listProgressForMentee(otherMentee.id)).length, 0);
  const content = await models.LearningModuleContent.create({
    module_id: moduleRecord.id,
    title: 'Required reading',
    is_required: true,
    is_published: true,
    is_authorized: true,
  });
  const quiz = await models.Quiz.create({
    module_id: moduleRecord.id,
    title: 'Knowledge check',
    pass_score: 1,
    attempt_limit: 2,
    is_published: true,
    is_authorized: true,
  });
  const question = await models.QuizQuestion.create({
    quiz_id: quiz.id,
    prompt: 'Select both correct options',
    question_type: 'multiple_choice',
    points: 1,
  });
  const otherQuestion = await models.QuizQuestion.create({
    quiz_id: quiz.id,
    prompt: 'A different question',
    points: 1,
  });
  const correctOne = await models.QuizQuestionOption.create({ question_id: question.id, text: 'Correct one', is_correct: true });
  const correctTwo = await models.QuizQuestionOption.create({ question_id: question.id, text: 'Correct two', is_correct: true });
  const wrongOption = await models.QuizQuestionOption.create({ question_id: question.id, text: 'Incorrect', is_correct: false });
  const unrelatedOption = await models.QuizQuestionOption.create({ question_id: otherQuestion.id, text: 'Unrelated', is_correct: true });

  await repository.grantModuleAccess({ menteeId: mentee.id, moduleId: moduleRecord.id, mentorId: mentor.id });
  await service.completeContent({ menteeId: mentee.id, moduleId: moduleRecord.id, contentId: content.id });
  await service.confirmModuleCompletion({ menteeId: mentee.id, moduleId: moduleRecord.id });
  await repository.removeModuleAccess({ menteeId: mentee.id, moduleId: moduleRecord.id });
  assert.equal(await repository.getModuleProgress({ menteeId: mentee.id, moduleId: moduleRecord.id }), null);
  assert.equal(await models.LearningModuleProgress.count({ where: { mentee_id: mentee.id, module_id: moduleRecord.id } }), 1);
  await repository.grantModuleAccess({ menteeId: mentee.id, moduleId: moduleRecord.id, mentorId: mentor.id });
  assert.equal((await repository.getModuleProgress({ menteeId: mentee.id, moduleId: moduleRecord.id })).assigned_by, mentor.id);
  const learnerQuiz = await service.getQuiz(quiz.id, mentee.id);
  const learnerOption = learnerQuiz.questions[0].options[0].get
    ? learnerQuiz.questions[0].options[0].get({ plain: true })
    : learnerQuiz.questions[0].options[0];
  assert.equal(Object.hasOwn(learnerOption, 'is_correct'), false);

  await service.startQuizAttempt({ quizId: quiz.id, menteeId: mentee.id });
  await assert.rejects(service.submitQuiz({
    quizId: quiz.id,
    menteeId: mentee.id,
    answers: [{ questionId: question.id, selectedOptionIds: [correctOne.id, unrelatedOption.id] }],
  }), { statusCode: 400 });

  const firstResult = await service.submitQuiz({
    quizId: quiz.id,
    menteeId: mentee.id,
    answers: [{ questionId: question.id, selectedOptionIds: [correctOne.id, correctTwo.id] }],
  });
  assert.equal(firstResult.passed, true);
  assert.equal(await models.QuizAttemptAnswer.count({ where: { attempt_id: firstResult.id } }), 2);
  const firstQuestionAnswer = await models.QuizAttemptAnswer.findOne({ where: { attempt_id: firstResult.id, question_id: question.id } });
  assert.equal(await models.QuizAttemptAnswerOption.count({ where: { answer_id: firstQuestionAnswer.id } }), 2);

  await service.startQuizAttempt({ quizId: quiz.id, menteeId: mentee.id });
  const secondResult = await service.submitQuiz({
    quizId: quiz.id,
    menteeId: mentee.id,
    answers: [{ questionId: question.id, selectedOptionId: wrongOption.id }],
  });
  assert.notEqual(secondResult.id, firstResult.id);
  assert.equal((await models.QuizAttempt.findByPk(firstResult.id)).score, 1);
  assert.equal((await service.listQuizAttempts({ quizId: quiz.id, menteeId: mentee.id })).length, 2);
  assert.equal((await service.listQuizAttempts({ quizId: quiz.id, menteeId: otherMentee.id })).length, 0);
  await repository.revokeModuleMentorAccess({ mentorId: mentor.id, moduleId: moduleRecord.id });
  assert.equal(await repository.getModuleProgress({ menteeId: mentee.id, moduleId: moduleRecord.id }), null);
  assert.equal((await models.LearningModuleProgress.findOne({
    where: { mentee_id: mentee.id, module_id: moduleRecord.id },
  })).status, 'access_revoked');
});

test('additive Learning migration creates missing progress and selected-option schema in memory', async () => {
  const { Sequelize, DataTypes } = require('sequelize');
  const migration = require('../../src/database/migrations/20261011100000-learning-content-progress');
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const queryInterface = sequelize.getQueryInterface();
  const idColumn = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };
  try {
    await queryInterface.createTable('users', { id: idColumn });
    await queryInterface.createTable('learning_modules', { id: idColumn });
    await queryInterface.createTable('learning_module_contents', {
      id: idColumn,
      module_id: DataTypes.INTEGER,
    });
    await queryInterface.createTable('learning_module_progress', {
      id: idColumn,
      mentee_id: DataTypes.INTEGER,
      module_id: DataTypes.INTEGER,
    });
    await queryInterface.createTable('quizzes', { id: idColumn });
    await queryInterface.createTable('quiz_attempt_answers', { id: idColumn });
    await queryInterface.createTable('quiz_question_options', { id: idColumn });

    await migration.up(queryInterface, DataTypes);
    assert.ok((await queryInterface.describeTable('quizzes')).is_published);
    assert.ok((await queryInterface.describeTable('learning_content_progress')).content_id);
    assert.ok((await queryInterface.describeTable('quiz_attempt_answer_options')).option_id);
    assert.ok((await queryInterface.showIndex('learning_content_progress')).some((index) => index.unique));
    await assert.rejects(migration.down(queryInterface, DataTypes), /irreversible/);
  } finally {
    await sequelize.close();
  }
});

test('learning authorization migration adds a non-null false default without losing existing modules', async () => {
  const { Sequelize, DataTypes } = require('sequelize');
  const migration = require('../../src/database/migrations/20261012100000-learning-material-authorization');
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const queryInterface = sequelize.getQueryInterface();
  const idColumn = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };

  try {
    await queryInterface.createTable('users', { id: idColumn });
    await queryInterface.createTable('learning_modules', {
      id: idColumn,
      title: DataTypes.STRING,
    });
    await queryInterface.createTable('learning_module_contents', {
      id: idColumn,
      title: DataTypes.STRING,
    });
    await queryInterface.createTable('quizzes', { id: idColumn });
    await queryInterface.createTable('learning_module_progress', { id: idColumn });
    await queryInterface.bulkInsert('learning_modules', [{ title: 'Existing module' }]);
    await queryInterface.bulkInsert('learning_module_contents', [{ title: 'Existing content' }]);

    await migration.up(queryInterface, DataTypes);

    const moduleColumns = await queryInterface.describeTable('learning_modules');
    const contentColumns = await queryInterface.describeTable('learning_module_contents');
    assert.equal(moduleColumns.is_authorized.allowNull, false);
    assert.equal(contentColumns.is_published.allowNull, false);
    assert.equal(contentColumns.is_authorized.allowNull, false);
    const [existingModule] = await sequelize.query(
      'SELECT is_authorized FROM learning_modules WHERE id = 1',
      { type: Sequelize.QueryTypes.SELECT }
    );
    const [existingContent] = await sequelize.query(
      'SELECT is_published, is_authorized FROM learning_module_contents WHERE id = 1',
      { type: Sequelize.QueryTypes.SELECT }
    );
    assert.equal(Boolean(existingModule.is_authorized), false);
    assert.equal(Boolean(existingContent.is_published), false);
    assert.equal(Boolean(existingContent.is_authorized), false);
  } finally {
    await sequelize.close();
  }
});

test('learning mentor-access migration creates indexed mentor grants without altering module data', async () => {
  const { Sequelize, DataTypes } = require('sequelize');
  const migration = require('../../src/database/migrations/20261017100000-learning-module-mentor-access');
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const queryInterface = sequelize.getQueryInterface();
  const idColumn = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };

  try {
    await queryInterface.createTable('users', { id: idColumn });
    await queryInterface.createTable('learning_modules', { id: idColumn, title: DataTypes.STRING });
    await queryInterface.bulkInsert('learning_modules', [{ title: 'Existing module' }]);
    await migration.up(queryInterface, DataTypes);

    const columns = await queryInterface.describeTable('learning_module_mentor_access');
    const indexes = await queryInterface.showIndex('learning_module_mentor_access');
    assert.ok(columns.module_id);
    assert.ok(columns.mentor_id);
    assert.ok(columns.granted_by);
    assert.ok(indexes.some((index) => index.unique
      && index.fields.map((field) => field.attribute || field.name).join(',') === 'module_id,mentor_id'));
    assert.equal(await queryInterface.rawSelect('learning_modules', { where: { id: 1 } }, 'id'), 1);
    await assert.rejects(migration.down(queryInterface, DataTypes), /irreversible/);
  } finally {
    await sequelize.close();
  }
});

test('learning mentor-permissions migration creates indexed permission grants and migrates legacy access', async () => {
  const { Sequelize, DataTypes } = require('sequelize');
  const migration = require('../../src/database/migrations/20261018100000-learning-module-mentor-permissions');
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const queryInterface = sequelize.getQueryInterface();
  const idColumn = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };

  try {
    await queryInterface.createTable('users', { id: idColumn });
    await queryInterface.createTable('learning_modules', { id: idColumn, title: DataTypes.STRING });
    await queryInterface.createTable('learning_module_mentor_access', {
      id: idColumn,
      module_id: DataTypes.INTEGER,
      mentor_id: DataTypes.INTEGER,
      granted_by: DataTypes.INTEGER,
      granted_at: DataTypes.DATE,
      revoked_at: DataTypes.DATE,
    });
    await queryInterface.bulkInsert('learning_modules', [{ title: 'Existing module' }]);
    await queryInterface.bulkInsert('learning_module_mentor_access', [{
      module_id: 1,
      mentor_id: 5,
      granted_by: 2,
      granted_at: new Date(),
      revoked_at: null,
    }]);

    await migration.up(queryInterface, DataTypes);

    const columns = await queryInterface.describeTable('learning_module_mentor_permissions');
    assert.ok(columns.module_id);
    assert.ok(columns.mentor_id);
    assert.ok(columns.permission);
    assert.ok(columns.granted_by);
    assert.ok(columns.revoked_by);
    assert.ok(columns.revoked_at);

    const migrated = await sequelize.query(
      'SELECT module_id, mentor_id, permission, granted_by FROM learning_module_mentor_permissions WHERE module_id = 1',
      { type: Sequelize.QueryTypes.SELECT }
    );
    assert.equal(migrated.length, 1);
    assert.equal(migrated[0].mentor_id, 5);
    assert.equal(migrated[0].permission, 'learning.resources.view');
    await assert.rejects(migration.down(queryInterface, DataTypes), /irreversible/);
  } finally {
    await sequelize.close();
  }
});

