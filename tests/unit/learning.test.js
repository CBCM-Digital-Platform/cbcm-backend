process.env.JWT_SECRET = 'learning-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const validator = require('../../src/validators/learning.validator');
const service = require('../../src/services/learning.service');
const controller = require('../../src/controllers/learning.controller');
const repository = require('../../src/repositories/learning.repository');
const resourcesRepository = require('../../src/repositories/resources.repository');
const notificationService = require('../../src/services/notifications.service');
const NotificationType = require('../../src/enums/notification-type.enum');
const models = require('../../src/models');
const resourceProgressService = require('../../src/services/learning-resource-progress.service');
const LearningMaterialCategory = require('../../src/enums/learning-material-category.enum');
const moduleDto = require('../../src/dtos/response/module.response.dto');
const learningMapper = require('../../src/mappers/learning.mapper');

const restore = (target, key, value) => {
  target[key] = value;
};

test('learning module validation rejects empty titles and invalid ids', () => {
  assert.throws(() => validator.parseModule({ title: '   ' }), { statusCode: 400 });
  assert.throws(() => validator.parseModule({ title: 'Module 1', estimatedDurationMinutes: 'nope' }), { statusCode: 400 });
  assert.equal(validator.parseId('2', 'moduleId'), 2);
  assert.throws(() => validator.parseId('0', 'moduleId'), { statusCode: 400 });
	assert.deepEqual(validator.parseMenteeId({ mentee_id: '7' }), { menteeId: 7 });
});

test('module response mappings omit retired contents and retain module and quiz fields', () => {
  const moduleRecord = {
    id: 5,
    title: 'Resource-backed module',
    description: 'Description',
    thematic_area_id: 3,
    protocol_summary: 'Protocol',
    status: 'published',
    order_number: 2,
    is_published: true,
    is_authorized: true,
    estimated_duration_minutes: 45,
    created_by: 7,
    updated_by: 8,
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-02T00:00:00.000Z',
    contents: [{ id: 12, title: 'Legacy article' }],
  };
  const dto = moduleDto.toModule(moduleRecord);
  assert.deepEqual(dto, {
    id: 5,
    title: 'Resource-backed module',
    description: 'Description',
    thematicAreaId: 3,
    protocolSummary: 'Protocol',
    status: 'published',
    orderNumber: 2,
    isPublished: true,
    isAuthorized: true,
    estimatedDurationMinutes: 45,
    createdBy: 7,
    updatedBy: 8,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
  });
  const detail = learningMapper.toModuleDetail({
    ...moduleRecord,
    quizzes: [{ id: 9, module_id: 5, title: 'Knowledge check' }],
  });
  assert.equal(Object.hasOwn(detail, 'contents'), false);
  assert.equal(detail.quizzes[0].id, 9);
});

test('module progress lookup honors the explicit cycle and does not silently reuse legacy null-cycle rows', async () => {
	const originalFindOne = models.LearningModuleProgress.findOne;
	const originalMentorPermissionFindOne = models.LearningModuleMentorPermission.findOne;
	const originalAssignmentFindOne = models.Assignment.findOne;
	const originalUserFindOne = models.User.findOne;
	const originalModuleFindByPk = models.LearningModule.findByPk;
	const seen = [];
	models.LearningModuleProgress.findOne = async ({ where }) => {
		seen.push(where);
    return where.cycle_id === 2
      ? { id: 77, mentee_id: 9, module_id: 4, cycle_id: 2, status: 'in_progress', completion_percentage: 40, assigned_by: 12 }
      : null;
	};
	models.LearningModuleMentorPermission.findOne = async () => ({ id: 1 });
	models.Assignment.findOne = async () => ({ id: 1 });
	models.User.findOne = async (query) => {
		if (query && query.where && query.where.id === 12) return { id: 12, role: 'mentor' };
		if (query && query.where && query.where.id === 9) return { id: 9, role: 'mentee', facility_id: 1 };
		return { id: query?.where?.id, role: 'mentee', facility_id: 1 };
	};
	models.LearningModule.findByPk = async () => ({ id: 4, thematic_area_id: 1 });
	try {
		const progress = await repository.getModuleProgress({ menteeId: 9, moduleId: 4, cycleId: 2 });
		assert.ok(progress);
		assert.equal(seen[0].cycle_id, 2);
		assert.notEqual(seen[0].cycle_id, null);
    assert.equal(await repository.getModuleProgress({ menteeId: 9, moduleId: 4, cycleId: 3 }), null);
    assert.equal(seen.length, 2, 'explicit cycle lookup must not issue a legacy null-cycle fallback query');
	} finally {
		models.LearningModuleProgress.findOne = originalFindOne;
		models.LearningModuleMentorPermission.findOne = originalMentorPermissionFindOne;
		models.Assignment.findOne = originalAssignmentFindOne;
		models.User.findOne = originalUserFindOne;
		models.LearningModule.findByPk = originalModuleFindByPk;
	}
});

test('resource progress resolves only valid cycle contexts and requires explicit selection when ambiguous', async () => {
  const originals = {
    userFindByPk: models.User.findByPk,
    assignmentFindAll: models.Assignment.findAll,
    cycleFacilityFindAll: models.CycleFacility.findAll,
    cycleThematicAreaFindAll: models.CycleThematicArea.findAll,
  };
  let assignments = [
    { facility_id: 1, cycle_id: 1, thematic_area_id: 3 },
    { facility_id: 2, cycle_id: 2, thematic_area_id: 3 },
  ];
  let facilityLinks = [{ cycle_id: 1, facility_id: 1 }, { cycle_id: 2, facility_id: 2 }];
  let thematicLinks = [{ cycle_id: 1, thematic_area_id: 3 }, { cycle_id: 2, thematic_area_id: 3 }];
  models.User.findByPk = async () => ({ id: 9, role: 'mentee' });
  models.Assignment.findAll = async () => assignments;
  models.CycleFacility.findAll = async () => facilityLinks;
  models.CycleThematicArea.findAll = async () => thematicLinks;
  const module = { id: 4, thematic_area_id: 3 };
  try {
    assert.equal((await resourceProgressService.resolveContext({ menteeId: 9, module, cycleId: 1 })).cycle_id, 1);
    assert.equal((await resourceProgressService.resolveContext({ menteeId: 9, module, cycleId: 2 })).cycle_id, 2);
    await assert.rejects(
      resourceProgressService.resolveContext({ menteeId: 9, module }),
      { statusCode: 400, code: 'AMBIGUOUS_CYCLE_CONTEXT' }
    );

    assignments = [assignments[0]];
    assert.equal((await resourceProgressService.resolveContext({ menteeId: 9, module })).cycle_id, 1);

    assignments = [{ facility_id: 99, cycle_id: 3, thematic_area_id: 3 }];
    facilityLinks = [{ cycle_id: 3, facility_id: 1 }];
    thematicLinks = [{ cycle_id: 3, thematic_area_id: 3 }];
    await assert.rejects(
      resourceProgressService.resolveContext({ menteeId: 9, module, cycleId: 3 }),
      { statusCode: 403 }
    );

    assignments = [{ facility_id: 1, cycle_id: 3, thematic_area_id: 3 }];
    facilityLinks = [{ cycle_id: 3, facility_id: 1 }];
    thematicLinks = [{ cycle_id: 3, thematic_area_id: 4 }];
    await assert.rejects(
      resourceProgressService.resolveContext({ menteeId: 9, module, cycleId: 3 }),
      { statusCode: 403 }
    );
  } finally {
    models.User.findByPk = originals.userFindByPk;
    models.Assignment.findAll = originals.assignmentFindAll;
    models.CycleFacility.findAll = originals.cycleFacilityFindAll;
    models.CycleThematicArea.findAll = originals.cycleThematicAreaFindAll;
  }
});

test('Resource progress calculation counts each required visible Resource once', () => {
	const resources = [
		{ id: 1, title: 'Manual', is_required: true, category: null },
		{ id: 2, title: 'Slides', is_required: true, category: 'PARTICIPANT_MANUAL' },
		{ id: 3, title: 'Exam', is_required: true, category: 'EXAMINATION' },
		{ id: 7, title: 'Video', is_required: true, category: null },
		{ id: 8, title: 'Audio', is_required: true, category: null },
		{ id: 4, title: 'Optional', is_required: false, category: null },
		{ id: 5, title: 'Guide', is_required: true, category: LearningMaterialCategory.FACILITATOR_GUIDE },
		{ id: 6, title: 'Key', is_required: true, category: LearningMaterialCategory.ANSWER_KEY },
	];
	const assignments = [
		{ id: 1, resource_id: 1, assignment_status: 'active', completed_at: new Date(), assigned_at: new Date('2026-01-01') },
		{ id: 2, resource_id: 1, assignment_status: 'active', completed_at: new Date(), assigned_at: new Date('2026-01-01') },
		{ id: 3, resource_id: 2, assignment_status: 'completed', completed_at: null, assigned_at: new Date('2026-01-01') },
		{ id: 4, resource_id: 3, assignment_status: 'active', completed_at: new Date(), assigned_at: new Date('2026-01-01') },
	];
	const progress = resourceProgressService.calculateResourceProgress(resources, assignments);
	assert.equal(progress.totalRequiredResources, 5);
	assert.equal(progress.completedRequiredResources, 3);
	assert.equal(progress.incompleteRequiredResources, 2);
	assert.equal(progress.completionPercentage, 60);
	assert.equal(progress.resources.length, 5);
});

test('latest assignment overrides older completions and zero requirements remain at zero percent', () => {
	const resources = [{ id: 11, title: 'Manual', is_required: true, category: null }];
	const oldCompletion = {
		id: 1,
		resource_id: 11,
		assignment_status: 'completed',
		completed_at: new Date('2026-01-01'),
		assigned_at: new Date('2026-01-01'),
	};
	const newerRevocation = {
		id: 2,
		resource_id: 11,
		assignment_status: 'revoked',
		revoked_at: new Date('2026-02-01'),
		assigned_at: new Date('2026-02-01'),
	};
	assert.equal(resourceProgressService.calculateResourceProgress(resources, [
		newerRevocation, oldCompletion,
	]).completionPercentage, 0);
	assert.equal(resourceProgressService.calculateResourceProgress(resources, [
		{ ...oldCompletion, assigned_at: new Date('2026-02-01'), id: 3, assignment_status: 'active', completed_at: null },
		oldCompletion,
	]).completionPercentage, 0);
	assert.equal(resourceProgressService.calculateResourceProgress([], []).completionPercentage, 0);
});

test('Resource history protection recognizes legacy LearningContentProgress rows', async () => {
  const originalProgressCount = models.LearningModuleProgress.count;
  const originalContentProgressCount = models.LearningContentProgress.count;
  models.LearningModuleProgress.count = async () => 0;
  models.LearningContentProgress.count = async ({ where }) => {
    assert.equal(where.module_id, 31);
    return 1;
  };
  try {
    assert.equal(await resourcesRepository.hasModuleLearningHistory(31), true);
  } finally {
    models.LearningModuleProgress.count = originalProgressCount;
    models.LearningContentProgress.count = originalContentProgressCount;
  }
});

test('module deletion preserves legacy content and completion history', async () => {
  const originals = {
    transaction: models.sequelize.transaction,
    moduleFindByPk: models.LearningModule.findByPk,
    quizFindAll: models.Quiz.findAll,
    questionFindAll: models.QuizQuestion.findAll,
    attemptFindAll: models.QuizAttempt.findAll,
    moduleProgressCount: models.LearningModuleProgress.count,
    contentProgressCount: models.LearningContentProgress.count,
    contentDestroy: models.LearningModuleContent.destroy,
    progressDestroy: models.LearningContentProgress.destroy,
    moduleProgressDestroy: models.LearningModuleProgress.destroy,
  };
  let legacyRowsDeleted = false;
  models.sequelize.transaction = async (callback) => callback({});
  models.LearningModule.findByPk = async () => ({ id: 32, destroy: async () => { legacyRowsDeleted = true; } });
  models.Quiz.findAll = async () => [];
  models.QuizQuestion.findAll = async () => [];
  models.QuizAttempt.findAll = async () => [];
  models.LearningModuleProgress.count = async () => 0;
  models.LearningContentProgress.count = async () => 1;
  models.LearningModuleContent.destroy = async () => { legacyRowsDeleted = true; };
  models.LearningContentProgress.destroy = async () => { legacyRowsDeleted = true; };
  models.LearningModuleProgress.destroy = async () => { legacyRowsDeleted = true; };
  try {
    await assert.rejects(repository.deleteModule(32), { statusCode: 409 });
    assert.equal(legacyRowsDeleted, false);
  } finally {
    models.sequelize.transaction = originals.transaction;
    models.LearningModule.findByPk = originals.moduleFindByPk;
    models.Quiz.findAll = originals.quizFindAll;
    models.QuizQuestion.findAll = originals.questionFindAll;
    models.QuizAttempt.findAll = originals.attemptFindAll;
    models.LearningModuleProgress.count = originals.moduleProgressCount;
    models.LearningContentProgress.count = originals.contentProgressCount;
    models.LearningModuleContent.destroy = originals.contentDestroy;
    models.LearningContentProgress.destroy = originals.progressDestroy;
    models.LearningModuleProgress.destroy = originals.moduleProgressDestroy;
  }
});

test('assigned mentors can grant and revoke whole-module access for their mentee', async () => {
	const originals = {
		getModuleById: repository.getModuleById,
		hasModuleMentorAccess: repository.hasModuleMentorAccess,
		hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
		isMentee: repository.isMentee,
		assignModuleToMentee: repository.assignModuleToMentee,
		revokeModuleAssignment: repository.revokeModuleAssignment,
	};
	const actor = { id: 4, role: 'mentor' };
	const progress = { id: 9, module_id: 3, mentee_id: 8, assigned_by: 4, status: 'not_started' };
	repository.getModuleById = async () => ({ id: 3, status: 'published', is_published: true, is_authorized: true });
	repository.hasModuleMentorAccess = async () => true;
	repository.hasActiveMentorAssignment = async ({ mentorId, menteeId, moduleId }) => mentorId === 4 && menteeId === 8 && moduleId === 3;
	repository.isMentee = async (menteeId) => menteeId === 8;
	repository.assignModuleToMentee = async (input) => ({ ...progress, ...input });
	repository.revokeModuleAssignment = async () => true;
	try {
		assert.deepEqual(await service.assignModuleToMentee({ moduleId: 3, menteeId: 8, actor }), { ...progress, moduleId: 3, menteeId: 8, mentorId: 4 });
		assert.deepEqual(await service.revokeModuleAssignment({ moduleId: 3, menteeId: 8, actor }), { revoked: true });
		await assert.rejects(service.assignModuleToMentee({ moduleId: 3, menteeId: 99, actor }), { statusCode: 403 });
	} finally {
		Object.assign(repository, originals);
	}
});

test('learning service rejects missing module ids and empty payloads', async () => {
  const original = repository.getModuleById;
  repository.getModuleById = async () => null;
  try {
    await assert.rejects(service.getModule(22), { statusCode: 404 });
    await assert.rejects(service.createModule({ title: '' }, { role: 'admin' }), { statusCode: 400 });
  } finally {
    repository.getModuleById = original;
  }
});

test('learning service ensures title trimming for create and update', async () => {
  const originalCreate = repository.createModule;
  const originalGet = repository.getModuleById;
  const originalDelete = repository.deleteModule;
  let createdPayload;
  let deletedModuleId;
  repository.createModule = async (payload) => {
    createdPayload = payload;
    return { id: 10, ...payload };
  };
  repository.deleteModule = async (moduleId) => {
    deletedModuleId = moduleId;
    return true;
  };
  repository.getModuleById = async (moduleId) => ({ id: moduleId, status: 'draft', is_published: false, is_authorized: false });

  try {
    const created = await service.createModule({ title: '  Intro to CBCM  ' }, { role: 'admin', id: 1 });
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
      const updated = await service.updateModule(3, { title: '  Updated title  ' }, { role: 'admin' });
      assert.equal(updated.title, 'Updated title');
    } finally {
      repository.updateModule = originalUpdate;
      notificationService.createNotifications = originalNotification;
    }
    assert.equal(await service.deleteModule(3, { role: 'admin', id: 1 }), true);
    assert.equal(deletedModuleId, 3);
  } finally {
    repository.createModule = originalCreate;
    repository.getModuleById = originalGet;
    repository.deleteModule = originalDelete;
  }
});

test('published module creation always persists published and authorized flags', async () => {
  const originalCreate = repository.createModule;
  let createdPayload;
  repository.createModule = async (payload) => {
    createdPayload = payload;
    return { id: 44, ...payload };
  };
  try {
    await service.createModule({ title: 'Maternal Health', status: 'published' }, { role: 'admin', id: 1 });
    assert.equal(createdPayload.status, 'published');
    assert.equal(createdPayload.isPublished, true);
    assert.equal(createdPayload.isAuthorized, true);
  } finally {
    repository.createModule = originalCreate;
  }
});

test.skip('individual mentor permissions are intentionally disabled; access is thematic-area based', async () => {
  const originals = {
    isMentor: repository.isMentor,
    hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
    isModuleInFacilityScope: repository.isModuleInFacilityScope,
    getUserById: repository.getUserById,
    getModuleById: repository.getModuleById,
    grantModuleMentorPermission: repository.grantModuleMentorPermission,
  };
  const grantInputs = [];
  repository.isMentor = async () => true;
  repository.hasActiveMentorAssignment = async () => true;
  repository.isModuleInFacilityScope = async () => true;
  repository.getUserById = async (id) => ({ id, role: 'mentor', facility_id: 1 });
  repository.getModuleById = async () => ({
    id: 3,
    status: 'published',
    is_published: true,
    is_authorized: true,
  });
  repository.grantModuleMentorPermission = async (input) => {
    grantInputs.push(input);
    return input;
  };
  try {
    await service.grantModuleMentorPermission({
      moduleId: 3,
      mentorId: 8,
      permission: LearningPermission.RESOURCES_VIEW,
      actor: { id: 2, role: 'facility_admin', facility_id: 1 },
    });
    assert.deepEqual(grantInputs, [
      {
        moduleId: 3,
        mentorId: 8,
        permission: LearningPermission.RESOURCES_VIEW,
        grantedBy: 2,
      },
      {
        moduleId: 3,
        mentorId: 8,
        permission: LearningPermission.MATERIALS_ASSIGN,
        grantedBy: 2,
      },
    ]);
    repository.getModuleById = async () => ({
      id: 3,
      status: 'draft',
      is_published: false,
      is_authorized: false,
    });
    await assert.rejects(service.grantModuleMentorPermission({
      moduleId: 3,
      mentorId: 8,
      permission: LearningPermission.RESOURCES_VIEW,
      actor: { id: 2, role: 'facility_admin', facility_id: 1 },
    }), { statusCode: 409 });
  } finally {
    repository.getModuleById = originals.getModuleById;
  }
});

test.skip('individual mentor permissions are intentionally disabled; access is thematic-area based', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    isModuleInFacilityScope: repository.isModuleInFacilityScope,
    isMentor: repository.isMentor,
    getUserById: repository.getUserById,
    hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
    revokeModuleMentorAccess: repository.revokeModuleMentorAccess,
  };
  repository.getModuleById = async () => ({ id: 3, status: 'published', is_published: true, is_authorized: true });
  repository.isModuleInFacilityScope = async () => true;
  repository.isMentor = async () => true;
  repository.getUserById = async (id) => ({ id, role: 'mentor', facility_id: 1 });
  repository.hasActiveMentorAssignment = async () => true;
  repository.revokeModuleMentorAccess = async () => true;
  try {
    await assert.rejects(service.grantModuleMentorPermission({
      moduleId: 3,
      mentorId: 8,
      permission: LearningPermission.RESOURCES_VIEW,
      actor: { id: 1, role: 'admin', facility_id: 1 },
    }), { statusCode: 403 });
    await assert.rejects(service.revokeModuleMentorPermission({
      moduleId: 3,
      mentorId: 8,
      permission: LearningPermission.RESOURCES_VIEW,
      actor: { id: 1, role: 'admin', facility_id: 1 },
    }), { statusCode: 403 });
    await assert.rejects(service.grantModuleMentorPermission({
      moduleId: 3,
      mentorId: 8,
      permission: LearningPermission.RESOURCES_VIEW,
      actor: { id: 8, role: 'mentor', facility_id: 1 },
    }), { statusCode: 403 });
    await service.revokeModuleMentorPermission({
      moduleId: 3,
      mentorId: 8,
      actor: { id: 2, role: 'facility_admin', facility_id: 1 },
    });
  } finally {
    Object.assign(repository, originals);
  }
});

test('mentors can open a published module through an active thematic-area assignment without a permission record', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
    hasModuleMentorPermission: repository.hasModuleMentorPermission,
  };
  const module = {
    id: 3,
    thematic_area_id: 12,
    status: 'published',
    is_published: true,
    is_authorized: true,
  };
  repository.getModuleById = async (id) => ({
    ...module,
    id,
  });
  repository.hasActiveMentorAssignment = async ({ mentorId, moduleId }) => mentorId === 8 && moduleId === 3;
  repository.hasModuleMentorPermission = async () => false;
  try {
    const result = await service.getModule(3, { role: 'mentor', userId: 8 });
    assert.equal(result.id, 3);
    assert.equal(result.thematic_area_id, 12);
  } finally {
    Object.assign(repository, originals);
  }
});

test('mentor module listings include published modules for active thematic areas without grants', async () => {
  const originals = {
    listActiveMentorThematicAreaIds: repository.listActiveMentorThematicAreaIds,
    listModuleIdsForThematicAreas: repository.listModuleIdsForThematicAreas,
    hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
    listModules: repository.listModules,
    hasModuleMentorPermission: repository.hasModuleMentorPermission,
  };
  let listFilters;
  repository.listActiveMentorThematicAreaIds = async () => [12];
  repository.listModuleIdsForThematicAreas = async () => [3];
  repository.hasActiveMentorAssignment = async ({ mentorId, moduleId }) => mentorId === 8 && moduleId === 3;
  repository.hasModuleMentorPermission = async () => false;
  repository.listModules = async (filters) => {
    listFilters = filters;
    return [{
      id: 3,
      status: 'published',
      is_published: true,
      is_authorized: true,
    }];
  };
  try {
    const result = await service.listModules({}, { id: 8, role: 'mentor' });
    assert.deepEqual(result.map((module) => module.id), [3]);
    assert.deepEqual(listFilters.moduleIds, [3]);
    assert.equal(listFilters.publishedOnly, true);
    assert.equal(listFilters.authorizedOnly, true);
  } finally {
    Object.assign(repository, originals);
  }
});

test('inactive or ended thematic-area assignments prevent mentor listing and module detail access', async () => {
  const originals = {
    listActiveMentorThematicAreaIds: repository.listActiveMentorThematicAreaIds,
    listModuleIdsForThematicAreas: repository.listModuleIdsForThematicAreas,
    hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
    listModules: repository.listModules,
    getModuleById: repository.getModuleById,
    hasModuleMentorPermission: repository.hasModuleMentorPermission,
  };
  repository.listActiveMentorThematicAreaIds = async () => [];
  repository.listModuleIdsForThematicAreas = async () => [];
  repository.hasActiveMentorAssignment = async () => false;
  repository.listModules = async ({ moduleIds }) => moduleIds.length ? [{ id: 3 }] : [];
  repository.getModuleById = async () => ({
    id: 3,
    thematic_area_id: 12,
    status: 'published',
    is_published: true,
    is_authorized: true,
  });
  repository.hasModuleMentorPermission = async () => false;
  try {
    assert.deepEqual(await service.listModules({}, { id: 8, role: 'mentor' }), []);
    await assert.rejects(service.getModule(3, { id: 8, role: 'mentor' }), { statusCode: 403 });
  } finally {
    Object.assign(repository, originals);
  }
});

test('mentors can list eligible modules across multiple active thematic-area assignments', async () => {
  const originals = {
    listActiveMentorThematicAreaIds: repository.listActiveMentorThematicAreaIds,
    listModuleIdsForThematicAreas: repository.listModuleIdsForThematicAreas,
    hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
    listModules: repository.listModules,
    hasModuleMentorPermission: repository.hasModuleMentorPermission,
  };
  let listFilters;
  repository.listActiveMentorThematicAreaIds = async () => [12, 13];
  repository.listModuleIdsForThematicAreas = async () => [3, 4, 5];
  repository.hasActiveMentorAssignment = async ({ moduleId }) => [3, 4].includes(moduleId);
  repository.listModules = async (filters) => {
    listFilters = filters;
    return [3, 4].map((id) => ({
      id,
      status: 'published',
      is_published: true,
      is_authorized: true,
    }));
  };
  repository.hasModuleMentorPermission = async () => false;
  try {
    const result = await service.listModules({}, { id: 8, role: 'mentor' });
    assert.deepEqual(result.map((module) => module.id), [3, 4]);
    assert.deepEqual(listFilters.moduleIds, [3, 4, 5]);
  } finally {
    Object.assign(repository, originals);
  }
});

test('different mentors receive only the published modules matching their own thematic areas', async () => {
  const originals = {
    listActiveMentorThematicAreaIds: repository.listActiveMentorThematicAreaIds,
    listModuleIdsForThematicAreas: repository.listModuleIdsForThematicAreas,
    listModules: repository.listModules,
  };
  repository.listActiveMentorThematicAreaIds = async (mentorId) => mentorId === 8 ? [12] : [13];
  repository.listModuleIdsForThematicAreas = async (areaIds) => areaIds.includes(12) ? [3] : [4];
  repository.listModules = async ({ moduleIds }) => moduleIds.map((id) => ({
    id,
    status: 'published',
    is_published: true,
    is_authorized: true,
  }));
  try {
    assert.deepEqual((await service.listModules({}, { id: 8, role: 'mentor' })).map((module) => module.id), [3]);
    assert.deepEqual((await service.listModules({}, { id: 9, role: 'mentor' })).map((module) => module.id), [4]);
  } finally {
    Object.assign(repository, originals);
  }
});

test('mentors cannot open unpublished or unauthorized modules despite active assignment', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
  };
  repository.getModuleById = async (id) => ({
    id,
    status: 'published',
    is_published: id !== 3,
    is_authorized: id !== 4,
  });
  repository.hasActiveMentorAssignment = async () => true;
  try {
    await assert.rejects(service.getModule(3, { id: 8, role: 'mentor' }), { statusCode: 403 });
    await assert.rejects(service.getModule(4, { id: 8, role: 'mentor' }), { statusCode: 403 });
  } finally {
    Object.assign(repository, originals);
  }
});

test('learning quiz submission requires publication, access, and confirmation before scoring', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    getQuizById: repository.getQuizById,
    getModuleProgress: repository.getModuleProgress,
    submitQuiz: repository.submitQuiz,
  };
  const originalGetResourceProgress = resourceProgressService.getProgress;
  const originalCreateNotification = notificationService.createNotification;
  let resourceProgressRequest;
  let notification;
  repository.getModuleById = async (id) => ({ id, status: 'published', is_published: true, is_authorized: true });
  repository.getQuizById = async (id) => ({ id, module_id: 4, is_published: true, is_authorized: true });
  repository.getModuleProgress = async ({ cycleId }) => (cycleId === 7 ? { status: 'not_started' } : null);
  resourceProgressService.getProgress = async (input) => {
    resourceProgressRequest = input;
    return {
      cycleId: 7,
      status: 'completed',
      totalRequiredResources: 1,
      incompleteRequiredResources: 0,
      completionPercentage: 100,
    };
  };
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
      cycleId: 7,
      answers: [{ questionId: 1, selectedOptionIds: [2] }],
    });
    assert.equal(resourceProgressRequest.cycleId, 7);
    assert.equal(resourceProgressRequest.module.id, 4);
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
    resourceProgressService.getProgress = originalGetResourceProgress;
    notificationService.createNotification = originalCreateNotification;
  }
});

test('quiz route ID and submission validation is enforced before service access', () => {
  assert.throws(() => validator.parseId('abc', 'quizId'), { statusCode: 400 });
  assert.deepEqual(validator.parseQuizSubmission({ answers: [{ questionId: '5', selectedOptionIds: [1, 2] }] }).answers[0], {
    questionId: 5,
    selectedOptionId: null,
    selectedOptionIds: [1, 2],
  });
});

test('quiz controllers forward the parsed cycle selection to every mentee eligibility operation', async () => {
  const originals = {
    getQuizByModule: service.getQuizByModule,
    getQuizByModuleForViewer: service.getQuizByModuleForViewer,
    getQuiz: service.getQuiz,
    startQuizAttempt: service.startQuizAttempt,
    submitQuiz: service.submitQuiz,
  };
  const calls = [];
  service.getQuizByModule = async (...args) => { calls.push(['module', ...args]); return {}; };
  service.getQuizByModuleForViewer = async (...args) => { calls.push(['viewer', ...args]); return {}; };
  service.getQuiz = async (...args) => { calls.push(['detail', ...args]); return {}; };
  service.startQuizAttempt = async (input) => { calls.push(['start', input]); return {}; };
  service.submitQuiz = async (input) => { calls.push(['submit', input]); return {}; };
  const invoke = (handler, req) => new Promise((resolve, reject) => {
    const res = {
      status() { return this; },
      json(body) { resolve(body); return this; },
    };
    handler(req, res, reject);
  });
  try {
    await invoke(controller.getQuizByModule, {
      params: { moduleId: '4' }, query: { cycle_id: '2' }, user: { id: 8, role: 'mentee' },
    });
    await invoke(controller.getQuizByModuleForViewer, {
      params: { moduleId: '4' }, query: { cycleId: '2' }, user: { id: 8, role: 'mentee' },
    });
    await invoke(controller.getQuiz, {
      params: { quizId: '7' }, query: { cycleId: '2' }, user: { id: 8, role: 'mentee' },
    });
    await invoke(controller.startQuizAttempt, {
      params: { quizId: '7' }, query: { cycleId: '2' }, user: { id: 8, role: 'mentee' },
    });
    await invoke(controller.submitQuiz, {
      params: { quizId: '7' }, query: { cycleId: '2' }, user: { id: 8, role: 'mentee' },
      learningInput: { answers: [{ questionId: 1, selectedOptionId: 2 }] },
    });
    assert.deepEqual(calls.map((call) => call[0]), ['module', 'viewer', 'detail', 'start', 'submit']);
    assert.equal(calls[0][3], 2);
    assert.equal(calls[1][3], 2);
    assert.equal(calls[2][3], 2);
    assert.equal(calls[3][1].cycleId, 2);
    assert.equal(calls[4][1].cycleId, 2);
  } finally {
    Object.assign(service, originals);
  }
});

test('learning routes expose the required aliases and omit the undefined hint endpoint', () => {
  const router = require('../../src/routes/learning.routes');
  const registered = router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`));
  const expected = [
    'PUT /modules/:id',
    'GET /mentees/:menteeId/modules',
    'GET /modules/:id',
    'POST /modules',
    'PATCH /modules/:id',
    'DELETE /modules/:id',
    'GET /my/modules/:moduleId',
    'GET /quizzes/:quizId/answer-key',
    'POST /modules/:moduleId/quizzes',
    'PATCH /quizzes/:quizId',
    'GET /my/modules/:moduleId/progress',
    'GET /my/modules/:moduleId/resources/progress',
    'POST /my/modules/:moduleId/confirm-completion',
    'POST /modules/:moduleId/resources/:resourceId/assignments',
    'GET /my/resources/:resourceId/content',
    'POST /my/resources/:resourceId/complete',
    'GET /modules/:moduleId/quiz',
    'GET /quizzes/:quizId/results',
    'GET /quizzes/:quizId/attempts',
    'POST /quizzes/:quizId/questions',
    'PUT /quizzes/:quizId/questions/:questionId',
    'POST /questions/:questionId/options',
    'PUT /questions/:questionId/options/:optionId',
  ];
  for (const route of expected) assert.ok(registered.includes(route), `${route} should be registered`);
  const retiredRoutes = [
    'GET /modules/:moduleId/contents',
    'POST /modules/:moduleId/contents',
    'GET /modules/:moduleId/contents/:contentId',
    'PATCH /modules/:moduleId/contents/:contentId',
    'PUT /modules/:moduleId/contents/:contentId',
    'DELETE /modules/:moduleId/contents/:contentId',
    'GET /modules/:moduleId/contents/:contentId/file',
    'POST /modules/:moduleId/content-file',
    'GET /my/modules/:moduleId/contents/progress',
    'POST /my/modules/:moduleId/contents/:contentId/complete',
  ];
  for (const route of retiredRoutes) assert.ok(!registered.includes(route), `${route} should not be registered`);
  assert.equal(registered.some((route) => route.includes('/mentor-permissions')), false);
  assert.equal(registered.some((route) => route.includes('/modules/:moduleId/access')), false);
  assert.equal(typeof service.grantModuleAccess, 'undefined');
  assert.equal(typeof service.getModuleAccess, 'undefined');
  assert.equal(typeof service.revokeModuleAccess, 'undefined');
  assert.equal(typeof validator.parseAccessGrant, 'undefined');
  assert.equal(registered.some((route) => route.includes('/mentor-access')), false);
  assert.ok(!registered.some((route) => route.includes('/hint')));
});

test('only Super Admin manages quizzes and mentors can view questions with normal module access', async () => {
  const originals = {
    getQuizById: repository.getQuizById,
    getModuleById: repository.getModuleById,
    isModuleInFacilityScope: repository.isModuleInFacilityScope,
    listQuizQuestions: repository.listQuizQuestions,
    hasActiveMentorAssignment: repository.hasActiveMentorAssignment,
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
  try {
    const questions = await service.listQuizQuestions(4, { id: 7, role: 'facility_admin', facility_id: 1 });
    assert.equal(questions[0].id, 9);
    await service.listQuizQuestions(4, { id: 8, role: 'mentor' });
    await assert.rejects(
      service.createQuiz({ moduleId: 3, title: 'Check', actor: { id: 1, role: 'facility_admin', facility_id: 1 } }),
      { statusCode: 403 }
    );
    repository.hasActiveMentorAssignment = async () => false;
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
    assessmentStage: 'PRETEST',
    questions: [{
      prompt: 'First priority?',
      choices: { A: 'Wait', B: 'Assess', C: 'Discharge', D: 'Delay' },
      correctAnswer: 'B',
    }],
  });
  assert.equal(quiz.questions[0].options.length, 4);
  assert.deepEqual(quiz.questions[0].options.map((option) => option.orderNumber), [0, 1, 2, 3]);
  assert.equal(quiz.questions[0].options[1].isCorrect, true);
  assert.equal(quiz.assessmentStage, 'PRETEST');
  assert.equal(validator.parseOption({ text: 'Assess', label: 'B', isCorrect: true }).orderNumber, 1);
  assert.equal(validator.parseQuiz({ title: 'Empty quiz', assessmentStage: 'POST_TEST' }).questions, undefined);
  assert.throws(() => validator.parseQuiz({ title: 'No stage' }), { statusCode: 400 });
  assert.throws(() => validator.parseQuiz({ title: 'Bad stage', assessmentStage: 'FINAL' }), { statusCode: 400 });
});

test('manual quiz creation validates and persists PRETEST or POST_TEST stage', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    createQuiz: repository.createQuiz,
  };
  const created = [];
  repository.getModuleById = async (id) => ({ id });
  repository.createQuiz = async (_moduleId, payload) => {
    created.push(payload);
    return payload;
  };
  try {
    for (const assessmentStage of ['PRETEST', 'POST_TEST']) {
      const quiz = await service.createQuiz({
        moduleId: 3,
        title: 'Assessment',
        assessmentStage,
        actor: { id: 1, role: 'admin' },
      });
      assert.equal(quiz.assessmentStage, assessmentStage);
    }
    await assert.rejects(service.createQuiz({
      moduleId: 3,
      title: 'Missing stage',
      actor: { id: 1, role: 'admin' },
    }), { statusCode: 400 });
    await assert.rejects(service.createQuiz({
      moduleId: 3,
      title: 'Invalid stage',
      assessmentStage: 'FINAL',
      actor: { id: 1, role: 'admin' },
    }), { statusCode: 400 });
    assert.deepEqual(created.map((quiz) => quiz.assessmentStage), ['PRETEST', 'POST_TEST']);
  } finally {
    Object.assign(repository, originals);
  }
});

test('module and quiz validators preserve false booleans and reject malformed answer IDs', () => {
  assert.equal(validator.parseModule({ title: 'Intro', isPublished: 'false' }).isPublished, false);
  assert.equal(validator.parseModule({ title: 'Intro', isAuthorized: 'false' }).isAuthorized, false);
  assert.equal(validator.parseQuiz({ title: 'Check', assessmentStage: 'PRETEST', isPublished: true, isAuthorized: false }).isAuthorized, false);
  assert.deepEqual(validator.parseMentorId({ mentorId: '12' }), { mentorId: 12 });
  assert.throws(() => validator.parseMentorId({ mentorId: 'bad' }), { statusCode: 400 });
  assert.throws(() => validator.parseQuizSubmission({ answers: [{ questionId: 2, selectedOptionId: 'bad' }] }), { statusCode: 400 });
});

test('ordinary quiz reads omit answer explanations while privileged reads retain them', async () => {
  const originalFindByPk = models.Quiz.findByPk;
  const calls = [];
  models.Quiz.findByPk = async (_id, options) => {
    calls.push(options);
    return null;
  };
  try {
    await repository.getQuizById(3);
    await repository.getQuizById(3, { includeCorrectAnswers: true });
    const attributes = calls.map((call) => call.include[0].attributes);
    assert.equal(attributes[0].includes('explanation'), false);
    assert.equal(attributes[1].includes('explanation'), true);
  } finally {
    models.Quiz.findByPk = originalFindByPk;
  }
});

test('learning publication patches change only the fields explicitly supplied', () => {
  assert.deepEqual(validator.parseModulePatch({ isAuthorized: true }), { isAuthorized: true });
  assert.deepEqual(validator.parseQuizPatch({ isAuthorized: true }), { isAuthorized: true });
  assert.throws(() => validator.parseModulePatch({}), { statusCode: 400 });
});

test('learning material structure migration preserves legacy content and enforces valid field combinations', async () => {
  const { Sequelize, DataTypes } = require('sequelize');
  const migration = require('../../src/database/migrations/20261105000000-add-learning-material-classification');
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const queryInterface = sequelize.getQueryInterface();
  try {
    await queryInterface.createTable('learning_module_contents', {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      title: DataTypes.STRING,
      file_id: DataTypes.INTEGER,
      content_url: DataTypes.STRING,
    });

    await queryInterface.bulkInsert('learning_module_contents', [{ title: 'Legacy content' }]);
    await migration.up(queryInterface, DataTypes);
    const columns = await queryInterface.describeTable('learning_module_contents');
    assert.ok(columns.category);
    assert.ok(columns.format);
    assert.ok(columns.assessment_stage);
    const [legacy] = await sequelize.query(
      'SELECT category, format, assessment_stage FROM learning_module_contents WHERE id = 1',
      { type: Sequelize.QueryTypes.SELECT }
    );
    assert.equal(legacy.category, null);
    assert.equal(legacy.format, null);
    assert.equal(legacy.assessment_stage, null);
    await queryInterface.bulkInsert('learning_module_contents', [{
      title: 'Valid exam PDF',
      category: 'EXAMINATION',
      format: 'PDF',
      file_id: 1,
      assessment_stage: 'PRETEST',
    }]);
    await assert.rejects(queryInterface.bulkInsert('learning_module_contents', [{
      title: 'Invalid exam',
      category: 'EXAMINATION',
      format: 'PDF',
      file_id: 1,
      assessment_stage: null,
    }]));
    await assert.rejects(queryInterface.bulkInsert('learning_module_contents', [{
      title: 'Invalid manual stage',
      category: 'PARTICIPANT_MANUAL',
      format: 'PDF',
      file_id: 1,
      assessment_stage: 'PRETEST',
    }]));
    await assert.rejects(queryInterface.bulkInsert('learning_module_contents', [{
      title: 'Ambiguous link',
      category: 'ANSWER_KEY',
      format: 'LINK',
      file_id: 1,
      content_url: 'https://example.test/key',
    }]));
    await assert.rejects(queryInterface.bulkInsert('learning_module_contents', [{
      title: 'Missing file',
      category: 'PARTICIPANT_MANUAL',
      format: 'PDF',
    }]));
    await assert.rejects(queryInterface.bulkInsert('learning_module_contents', [{
      title: 'Missing link',
      category: 'PARTICIPANT_MANUAL',
      format: 'LINK',
    }]));
    await assert.rejects(queryInterface.bulkInsert('learning_module_contents', [{
      title: 'Non-PDF examination',
      category: 'EXAMINATION',
      format: 'PPTX',
      file_id: 1,
      assessment_stage: 'PRETEST',
    }]));
    await assert.rejects(queryInterface.bulkInsert('learning_module_contents', [{
      title: 'Non-PDF answer key',
      category: 'ANSWER_KEY',
      format: 'VIDEO',
      file_id: 1,
    }]));
  } finally {
    await sequelize.close();
  }
});

test('quiz stage migration adds optional, constrained stages to quizzes and import drafts', async () => {
  const { Sequelize, DataTypes } = require('sequelize');
  const migration = require('../../src/database/migrations/20261106000000-add-assessment-stage-to-quizzes-and-import-drafts');
  const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
  const queryInterface = sequelize.getQueryInterface();
  try {
    for (const table of ['quizzes', 'quiz_import_drafts']) {
      await queryInterface.createTable(table, {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
      });
    }
    await migration.up(queryInterface, DataTypes);
    for (const table of ['quizzes', 'quiz_import_drafts']) {
      const columns = await queryInterface.describeTable(table);
      assert.ok(columns.assessment_stage);
    }
    await queryInterface.bulkInsert('quizzes', [
      { assessment_stage: 'PRETEST' },
      { assessment_stage: 'POST_TEST' },
      {},
    ]);
    await assert.rejects(queryInterface.bulkInsert('quiz_import_drafts', [{ assessment_stage: 'FINAL' }]));
  } finally {
    await sequelize.close();
  }
});

test('quiz remains locked until every required item is completed and confirmed', async () => {
  const originals = {
    getQuizById: repository.getQuizById,
    getModuleById: repository.getModuleById,
    getModuleProgress: repository.getModuleProgress,
  };
  const originalGetResourceProgress = resourceProgressService.getProgress;
  repository.getQuizById = async () => ({ id: 7, module_id: 3, is_published: true, is_authorized: true });
  repository.getModuleById = async () => ({ id: 3, status: 'published', is_published: true, is_authorized: true });
  repository.getModuleProgress = async () => ({ status: 'in_progress' });
  resourceProgressService.getProgress = async () => ({
    cycleId: 2,
    status: 'in_progress',
    totalRequiredResources: 2,
    incompleteRequiredResources: 1,
    completionPercentage: 50,
  });
  try {
    await assert.rejects(
      service.getQuiz(7, 8, 2),
      { statusCode: 409 }
    );
  } finally {
    Object.assign(repository, originals);
    resourceProgressService.getProgress = originalGetResourceProgress;
  }
});

test('learning completion confirmation rejects modules with unfinished required content', async () => {
  const originals = {
    getModuleById: repository.getModuleById,
    confirmProgress: resourceProgressService.confirmProgress,
  };
  repository.getModuleById = async (id) => ({ id, status: 'published', is_published: true, is_authorized: true });
  resourceProgressService.confirmProgress = async () => { throw { statusCode: 409 }; };
  try {
    await assert.rejects(
      service.confirmModuleCompletion({ menteeId: 4, moduleId: 8 }),
      { statusCode: 409 }
    );
  } finally {
    repository.getModuleById = originals.getModuleById;
    resourceProgressService.confirmProgress = originals.confirmProgress;
  }
});

test('learning quiz persistence stores multi-select answers once per question and isolates attempts', async () => {
  await models.sequelize.sync({ force: true });
  const admin = await models.User.create({ full_name: 'Learning Admin', email: 'learning-admin@example.test', role: 'admin', status: 'active' });
  const mentor = await models.User.create({ full_name: 'Learning Mentor', email: 'learning-mentor@example.test', role: 'mentor', status: 'active' });
  const mentee = await models.User.create({ full_name: 'Mentee', email: 'mentee-learning@example.test', role: 'mentee', status: 'active' });
  const otherMentee = await models.User.create({ full_name: 'Other Mentee', email: 'other-learning@example.test', role: 'mentee', status: 'active' });
  const thematicArea = await models.ThematicArea.create({ id: 1, code: 'QUIZ', name: 'Quiz access' });
  const moduleRecord = await models.LearningModule.create({
    title: 'Learning integration test',
    thematic_area_id: thematicArea.id,
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
  await models.Assignment.create({
    mentor_id: mentor.id,
    mentee_id: mentee.id,
    thematic_area_id: thematicArea.id,
    status: 'active',
  });
  const cycle = await models.MentorshipCycle.create({ id: 1, name: 'Progress cycle', status: 'active' });
  const secondCycle = await models.MentorshipCycle.create({ id: 2, name: 'Second progress cycle', status: 'active' });
  const facility = await models.Facility.create({ id: 1, name: 'Progress facility', type: 'Hospital' });
  const secondFacility = await models.Facility.create({ id: 2, name: 'Second progress facility', type: 'Hospital' });
  await models.CycleFacility.create({ cycle_id: cycle.id, facility_id: facility.id });
  await models.CycleFacility.create({ cycle_id: secondCycle.id, facility_id: secondFacility.id });
  await models.CycleThematicArea.create({ cycle_id: cycle.id, thematic_area_id: thematicArea.id });
  await models.CycleThematicArea.create({ cycle_id: secondCycle.id, thematic_area_id: thematicArea.id });
  await models.Assignment.create({
    mentor_id: mentor.id,
    mentee_id: mentee.id,
    facility_id: facility.id,
    cycle_id: cycle.id,
    thematic_area_id: thematicArea.id,
    status: 'active',
    assigned_at: new Date(),
  });
  await models.Assignment.create({
    mentor_id: mentor.id,
    mentee_id: mentee.id,
    facility_id: secondFacility.id,
    cycle_id: secondCycle.id,
    thematic_area_id: thematicArea.id,
    status: 'active',
    assigned_at: new Date(),
  });
  await models.LearningModuleProgress.create({
    mentee_id: otherMentee.id,
    module_id: moduleRecord.id,
    assigned_by: admin.id,
    assigned_at: new Date(),
    status: 'not_started',
  });
  assert.equal(await repository.getModuleProgress({ menteeId: otherMentee.id, moduleId: moduleRecord.id }), null);
  assert.equal((await repository.listProgressForMentee(otherMentee.id)).length, 0);
  const requiredResource = await models.Resource.create({
    title: 'Required quiz preparation',
    type: 'pdf',
    thematic_area_id: thematicArea.id,
    module_id: moduleRecord.id,
    is_required: true,
  });
  const secondRequiredResource = await models.Resource.create({
    title: 'Second required quiz preparation',
    type: 'pdf',
    thematic_area_id: thematicArea.id,
    module_id: moduleRecord.id,
    is_required: true,
  });
  await models.Resource.bulkCreate([
    {
      title: 'Optional quiz preparation',
      type: 'pdf',
      thematic_area_id: thematicArea.id,
      module_id: moduleRecord.id,
      is_required: false,
    },
    {
      title: 'Facilitator-only quiz guide',
      type: 'pdf',
      thematic_area_id: thematicArea.id,
      module_id: moduleRecord.id,
      category: LearningMaterialCategory.FACILITATOR_GUIDE,
      is_required: true,
    },
    {
      title: 'Quiz answer key',
      type: 'pdf',
      thematic_area_id: thematicArea.id,
      module_id: moduleRecord.id,
      category: LearningMaterialCategory.ANSWER_KEY,
      is_required: true,
    },
  ]);
  await models.ResourceAssignment.create({
    resource_id: requiredResource.id,
    mentor_id: mentor.id,
    mentee_id: mentee.id,
    facility_id: facility.id,
    module_id: moduleRecord.id,
    cycle_id: cycle.id,
    thematic_area_id: thematicArea.id,
    assignment_status: 'active',
    assigned_by: mentor.id,
    assigned_at: new Date(),
    completed_at: new Date(),
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

  await models.LearningModuleProgress.create({
    mentee_id: mentee.id,
    module_id: moduleRecord.id,
    assigned_by: mentor.id,
    assigned_at: new Date(),
    status: 'not_started',
  });
  await repository.assignModuleToMentee({
    menteeId: mentee.id,
    moduleId: moduleRecord.id,
    mentorId: mentor.id,
    cycleId: cycle.id,
  });
  await repository.assignModuleToMentee({
    menteeId: mentee.id,
    moduleId: moduleRecord.id,
    mentorId: mentor.id,
    cycleId: secondCycle.id,
  });
  await assert.rejects(
    service.confirmModuleCompletion({ menteeId: mentee.id, moduleId: moduleRecord.id, cycleId: cycle.id }),
    { statusCode: 409, code: 'CONFLICT' }
  );
  await models.ResourceAssignment.create({
    resource_id: secondRequiredResource.id,
    mentor_id: mentor.id,
    mentee_id: mentee.id,
    facility_id: facility.id,
    module_id: moduleRecord.id,
    cycle_id: cycle.id,
    thematic_area_id: thematicArea.id,
    assignment_status: 'completed',
    assigned_by: mentor.id,
    assigned_at: new Date(),
    completed_at: new Date(),
  });
  for (const resource of [requiredResource, secondRequiredResource]) {
    await models.ResourceAssignment.create({
      resource_id: resource.id,
      mentor_id: mentor.id,
      mentee_id: mentee.id,
      facility_id: secondFacility.id,
      module_id: moduleRecord.id,
      cycle_id: secondCycle.id,
      thematic_area_id: thematicArea.id,
      assignment_status: 'completed',
      assigned_by: mentor.id,
      assigned_at: new Date(),
      completed_at: new Date(),
    });
  }
  await service.confirmModuleCompletion({ menteeId: mentee.id, moduleId: moduleRecord.id, cycleId: cycle.id });
  const cycleProgress = await models.LearningModuleProgress.findOne({
    where: { mentee_id: mentee.id, module_id: moduleRecord.id, cycle_id: cycle.id },
  });
  assert.equal(cycleProgress.status, 'completed');
  const completedResourceProgress = await resourceProgressService.getProgress({
    menteeId: mentee.id,
    module: moduleRecord,
    cycleId: cycle.id,
  });
  assert.equal(completedResourceProgress.totalRequiredResources, 2);
  assert.equal(completedResourceProgress.completionPercentage, 100);
  assert.equal(completedResourceProgress.status, 'completed');
  const unconfirmedCycleProgress = await resourceProgressService.getProgress({
    menteeId: mentee.id,
    module: moduleRecord,
    cycleId: secondCycle.id,
  });
  assert.equal(unconfirmedCycleProgress.totalRequiredResources, 2);
  assert.equal(unconfirmedCycleProgress.completionPercentage, 100);
  assert.notEqual(unconfirmedCycleProgress.status, 'completed');
  assert.equal(await models.LearningModuleProgress.count({
    where: { mentee_id: otherMentee.id, module_id: moduleRecord.id, cycle_id: cycle.id },
  }), 0);

  const emptyModule = await models.LearningModule.create({
    title: 'Module without required Resources',
    thematic_area_id: thematicArea.id,
    status: 'published',
    is_published: true,
    is_authorized: true,
  });
  await assert.rejects(
    service.confirmModuleCompletion({ menteeId: mentee.id, moduleId: emptyModule.id, cycleId: cycle.id }),
    { statusCode: 409, code: 'CONFLICT' }
  );
  await models.LearningModuleProgress.update(
    { status: 'access_revoked' },
    { where: { mentee_id: mentee.id, module_id: moduleRecord.id, cycle_id: null } }
  );
  assert.equal((await repository.getModuleProgress({ menteeId: mentee.id, moduleId: moduleRecord.id, cycleId: cycle.id })).status, 'completed');
  assert.equal(await models.LearningModuleProgress.count({
    where: { mentee_id: mentee.id, module_id: moduleRecord.id, cycle_id: null },
  }), 1);
  await models.LearningModuleProgress.update(
    { assigned_by: mentor.id, status: 'completed' },
    { where: { mentee_id: mentee.id, module_id: moduleRecord.id, cycle_id: null } }
  );
  const legacyProgress = await models.LearningModuleProgress.findOne({
    where: { mentee_id: mentee.id, module_id: moduleRecord.id, cycle_id: null },
  });
  assert.equal(legacyProgress.assigned_by, mentor.id);
  assert.equal((await repository.getModuleProgress({ menteeId: mentee.id, moduleId: moduleRecord.id, cycleId: cycle.id })).assigned_by, mentor.id);
  const learnerQuiz = await service.getQuiz(quiz.id, mentee.id, cycle.id);
  const learnerOption = learnerQuiz.questions[0].options[0].get
    ? learnerQuiz.questions[0].options[0].get({ plain: true })
    : learnerQuiz.questions[0].options[0];
  assert.equal(Object.hasOwn(learnerOption, 'is_correct'), false);
  await assert.rejects(service.getQuizAnswerKey({
    quizId: quiz.id,
    actor: { id: mentee.id, role: 'mentee' },
  }), { statusCode: 403 });
  assert.equal((await service.getQuizByModule(moduleRecord.id, mentee.id, cycle.id)).id, quiz.id);
  await assert.rejects(service.getQuizByModule(moduleRecord.id, mentee.id, secondCycle.id), {
    statusCode: 409,
    code: 'CONFLICT',
  });
  await assert.rejects(service.getQuizByModule(moduleRecord.id, mentee.id), {
    statusCode: 400,
    code: 'AMBIGUOUS_CYCLE_CONTEXT',
  });
  await assert.rejects(service.getQuiz(quiz.id, mentee.id), {
    statusCode: 400,
    code: 'AMBIGUOUS_CYCLE_CONTEXT',
  });
  await assert.rejects(service.getQuiz(quiz.id, otherMentee.id, cycle.id), { statusCode: 403 });
  await assert.rejects(service.startQuizAttempt({
    quizId: quiz.id,
    menteeId: otherMentee.id,
    cycleId: cycle.id,
  }), { statusCode: 403 });
  await assert.rejects(service.submitQuiz({
    quizId: quiz.id,
    menteeId: otherMentee.id,
    cycleId: cycle.id,
    answers: [{ questionId: question.id, selectedOptionId: wrongOption.id }],
  }), { statusCode: 403 });
  await assert.rejects(service.startQuizAttempt({ quizId: quiz.id, menteeId: mentee.id }), {
    statusCode: 400,
    code: 'AMBIGUOUS_CYCLE_CONTEXT',
  });
  await assert.rejects(service.startQuizAttempt({
    quizId: quiz.id,
    menteeId: mentee.id,
    cycleId: secondCycle.id,
  }), { statusCode: 409, code: 'CONFLICT' });
  assert.equal(await models.QuizAttempt.count({ where: { quiz_id: quiz.id, mentee_id: mentee.id } }), 0);

  await service.startQuizAttempt({ quizId: quiz.id, menteeId: mentee.id, cycleId: cycle.id });
  await assert.rejects(service.submitQuiz({
    quizId: quiz.id,
    menteeId: mentee.id,
    cycleId: secondCycle.id,
    answers: [{ questionId: question.id, selectedOptionId: wrongOption.id }],
  }), { statusCode: 409, code: 'CONFLICT' });
  await assert.rejects(service.submitQuiz({
    quizId: quiz.id,
    menteeId: mentee.id,
    answers: [{ questionId: question.id, selectedOptionId: wrongOption.id }],
  }), { statusCode: 400, code: 'AMBIGUOUS_CYCLE_CONTEXT' });
  await assert.rejects(service.submitQuiz({
    quizId: quiz.id,
    menteeId: mentee.id,
    cycleId: cycle.id,
    answers: [{ questionId: question.id, selectedOptionIds: [correctOne.id, unrelatedOption.id] }],
  }), { statusCode: 400 });

  const firstResult = await service.submitQuiz({
    quizId: quiz.id,
    menteeId: mentee.id,
    cycleId: cycle.id,
    answers: [{ questionId: question.id, selectedOptionIds: [correctOne.id, correctTwo.id] }],
  });
  assert.equal(firstResult.passed, true);
  assert.equal(await models.QuizAttemptAnswer.count({ where: { attempt_id: firstResult.id } }), 2);
  const firstQuestionAnswer = await models.QuizAttemptAnswer.findOne({ where: { attempt_id: firstResult.id, question_id: question.id } });
  assert.equal(await models.QuizAttemptAnswerOption.count({ where: { answer_id: firstQuestionAnswer.id } }), 2);

  await service.startQuizAttempt({ quizId: quiz.id, menteeId: mentee.id, cycleId: cycle.id });
  const secondResult = await service.submitQuiz({
    quizId: quiz.id,
    menteeId: mentee.id,
    cycleId: cycle.id,
    answers: [{ questionId: question.id, selectedOptionId: wrongOption.id }],
  });
  assert.notEqual(secondResult.id, firstResult.id);
  assert.equal((await models.QuizAttempt.findByPk(firstResult.id)).score, 1);
  assert.equal((await service.listQuizAttempts({ quizId: quiz.id, menteeId: mentee.id })).length, 2);
  assert.equal((await service.listQuizAttempts({ quizId: quiz.id, menteeId: otherMentee.id })).length, 0);
  await assert.rejects(service.startQuizAttempt({ quizId: quiz.id, menteeId: mentee.id, cycleId: cycle.id }), {
    statusCode: 409,
    code: 'CONFLICT',
  });
  assert.equal((await repository.getModuleProgress({ menteeId: mentee.id, moduleId: moduleRecord.id }))?.module_id, moduleRecord.id);
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

test('cycle progress migration preserves legacy rows and permits multiple NULL-cycle rows', async () => {
	const { Sequelize, DataTypes } = require('sequelize');
	const migration = require('../../src/database/migrations/20261114000000-cycle-scope-learning-module-progress');
	const sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
	const queryInterface = sequelize.getQueryInterface();
	const idColumn = { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true };
	try {
		await queryInterface.createTable('mentorship_cycles', { id: idColumn });
		await queryInterface.createTable('learning_module_progress', {
			id: idColumn,
			mentee_id: DataTypes.INTEGER,
			module_id: DataTypes.INTEGER,
			status: DataTypes.STRING,
		});
		await queryInterface.addIndex('learning_module_progress', ['mentee_id', 'module_id'], {
			unique: true,
			name: 'uq_learning_module_progress_mentee_module',
		});
		await queryInterface.bulkInsert('learning_module_progress', [{
			mentee_id: 7,
			module_id: 3,
			status: 'completed',
		}]);
		await queryInterface.bulkInsert('mentorship_cycles', [{ id: 1 }]);

		await migration.up(queryInterface, DataTypes);
		assert.ok((await queryInterface.describeTable('learning_module_progress')).cycle_id);
		const [legacy] = await sequelize.query(
			'SELECT cycle_id, status FROM learning_module_progress WHERE mentee_id = 7 AND module_id = 3',
			{ type: Sequelize.QueryTypes.SELECT }
		);
		assert.equal(legacy.cycle_id, null);
		assert.equal(legacy.status, 'completed');
		await queryInterface.bulkInsert('learning_module_progress', [
			{ mentee_id: 7, module_id: 3, cycle_id: null, status: 'in_progress' },
			{ mentee_id: 7, module_id: 3, cycle_id: 1, status: 'not_started' },
		]);
		await assert.rejects(sequelize.query(
			"INSERT INTO learning_module_progress (mentee_id, module_id, cycle_id, status) VALUES (7, 3, 1, 'completed')"
		));
		const indexes = await queryInterface.showIndex('learning_module_progress');
		assert.ok(indexes.some((index) => index.unique
			&& index.fields.map((field) => field.attribute || field.name).join(',') === 'mentee_id,module_id,cycle_id'));
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
    await queryInterface.bulkInsert('users', [
      { id: 2 },
      { id: 5 },
    ]);
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
