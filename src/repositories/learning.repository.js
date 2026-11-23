
const { Op } = require('sequelize');
const models = require('../models');
const AppError = require('../errors/app-error');
const isLearnerVisible = { is_published: true, is_authorized: true };
const ACTIVE_ASSIGNMENT_STATUSES = ['assigned', 'active'];

const listModules = async ({ status, thematicAreaId, createdBy, publishedOnly = false, authorizedOnly = false, moduleIds } = {}) => {
	const where = {};
	if (status) where.status = status;
	if (thematicAreaId) where.thematic_area_id = thematicAreaId;
	if (createdBy) where.created_by = createdBy;
	if (moduleIds) where.id = { [Op.in]: moduleIds };
	if (publishedOnly) {
		where.is_published = true;
		where.status = 'published';
	}
	if (authorizedOnly) where.is_authorized = true;

	const modules = await models.LearningModule.findAll({
		where,
		include: [{ model: models.ThematicArea, as: 'thematicArea', attributes: ['id', 'name'] }],
		order: [['order_number', 'ASC'], ['id', 'ASC']],
	});

	if (modules.length === 0) return modules;

	const moduleIdsWithCounts = modules.map(m => m.id);
	const moduleById = new Map(modules.map((module) => [Number(module.id), module]));
	const thematicAreaIds = [...new Set(modules.map((module) => Number(module.thematic_area_id)).filter((id) => Number.isFinite(id) && id > 0))];
	const mentorCounts = {};
	if (thematicAreaIds.length && models.Assignment) {
		const assignments = await models.Assignment.findAll({
			where: {
				thematic_area_id: { [Op.in]: thematicAreaIds },
				status: { [Op.in]: ACTIVE_ASSIGNMENT_STATUSES },
				unassigned_at: null,
			},
			attributes: ['mentor_id', 'thematic_area_id'],
		});
		const unique = new Set();
		assignments.forEach((entry) => {
			const key = `${entry.mentor_id}:${entry.thematic_area_id}`;
			if (unique.has(key)) return;
			unique.add(key);
			modules.forEach((module) => {
				if (Number(module.thematic_area_id) === Number(entry.thematic_area_id)) {
					mentorCounts[module.id] = (mentorCounts[module.id] || 0) + 1;
				}
			});
		});
	}

	return modules.map(module => ({
		...module.toJSON(),
		activeMentorCount: mentorCounts[module.id] || 0,
	}));
};

const listModuleIdsForFacility = async (facilityId) => {
	const adminUsers = await models.User.findAll({
		where: { role: 'admin' },
		attributes: ['id'],
	});
	const adminIds = adminUsers.map((entry) => entry.id);
	const adminModules = adminIds.length
		? await models.LearningModule.findAll({
			where: { created_by: { [Op.in]: adminIds } },
			attributes: ['id'],
		})
		: [];
	const adminModuleIds = adminModules.map((entry) => entry.id);

	if (!facilityId) return adminModuleIds;
	const modules = await models.LearningModule.findAll({
		where: { thematic_area_id: { [Op.ne]: null } },
		attributes: ['id', 'thematic_area_id'],
	});
	if (!modules.length) return adminModuleIds;
	const thematicAreaIds = [...new Set(modules.map((module) => module.thematic_area_id))];
	const cycleThematicAreas = await models.CycleThematicArea.findAll({
		where: { thematic_area_id: { [Op.in]: thematicAreaIds } },
		attributes: ['cycle_id', 'thematic_area_id'],
	});
	if (!cycleThematicAreas.length) return adminModuleIds;
	const cycleIds = [...new Set(cycleThematicAreas.map((entry) => entry.cycle_id))];
	const facilityCycles = await models.CycleFacility.findAll({
		where: { facility_id: facilityId, cycle_id: { [Op.in]: cycleIds } },
		attributes: ['cycle_id'],
	});
	const facilityCycleIds = new Set(facilityCycles.map((entry) => Number(entry.cycle_id)));
	const scopedThematicAreaIds = new Set(cycleThematicAreas
		.filter((entry) => facilityCycleIds.has(Number(entry.cycle_id)))
		.map((entry) => Number(entry.thematic_area_id)));
	const facilityScopedIds = modules
		.filter((module) => scopedThematicAreaIds.has(Number(module.thematic_area_id)))
		.map((module) => module.id);
	return [...new Set([...adminModuleIds, ...facilityScopedIds])];
};

const isModuleInFacilityScope = async ({ moduleId, facilityId }) => {
	const module = await models.LearningModule.findByPk(moduleId, { attributes: ['thematic_area_id'] });
	if (!module) return false;
	if (!module.thematic_area_id || !facilityId) return false;
	return isThematicAreaInFacilityScope({
		thematicAreaId: module.thematic_area_id,
		facilityId,
	});
};

const isThematicAreaInFacilityScope = async ({ thematicAreaId, facilityId }) => {
	if (!thematicAreaId || !facilityId) return false;
	const cycleThematicAreas = await models.CycleThematicArea.findAll({
		where: { thematic_area_id: thematicAreaId },
		attributes: ['cycle_id'],
	});
	if (!cycleThematicAreas.length) return false;
	return Boolean(await models.CycleFacility.findOne({
		where: {
			facility_id: facilityId,
			cycle_id: { [Op.in]: cycleThematicAreas.map((entry) => entry.cycle_id) },
		},
		attributes: ['id'],
	}));
};

const getModuleById = async (moduleId, { learnerVisible = false } = {}) => models.LearningModule.findByPk(moduleId, {
	include: [
		{ model: models.ThematicArea, as: 'thematicArea', attributes: ['id', 'name'] },
		{
			model: models.Quiz,
			as: 'quizzes',
			...(learnerVisible ? { where: isLearnerVisible, required: false } : {}),
		},
	],
});

const createModule = async (payload = {}) => models.LearningModule.create({
	title: payload.title,
	description: payload.description || null,
	thematic_area_id: payload.thematicAreaId ?? payload.thematic_area_id ?? null,
	protocol_summary: payload.protocolSummary || payload.protocol_summary || null,
	status: payload.status || 'draft',
	order_number: payload.orderNumber ?? payload.order_number ?? 0,
	is_published: payload.isPublished ?? payload.is_published ?? false,
	is_authorized: payload.isAuthorized ?? payload.is_authorized ?? false,
	estimated_duration_minutes: payload.estimatedDurationMinutes ?? payload.estimated_duration_minutes ?? 0,
	created_by: payload.createdBy ?? payload.created_by ?? null,
	updated_by: payload.updatedBy ?? payload.updated_by ?? null,
});

const updateModule = async (moduleId, payload = {}) => {
	const updatePayload = { ...payload };
	if ('thematicAreaId' in updatePayload) updatePayload.thematic_area_id = updatePayload.thematicAreaId;
	if ('protocolSummary' in updatePayload) updatePayload.protocol_summary = updatePayload.protocolSummary;
	if ('orderNumber' in updatePayload) updatePayload.order_number = updatePayload.orderNumber;
	if ('isPublished' in updatePayload) updatePayload.is_published = updatePayload.isPublished;
	if ('isAuthorized' in updatePayload) updatePayload.is_authorized = updatePayload.isAuthorized;
	if ('estimatedDurationMinutes' in updatePayload) updatePayload.estimated_duration_minutes = updatePayload.estimatedDurationMinutes;
	if ('createdBy' in updatePayload) delete updatePayload.createdBy;
	if ('updatedBy' in updatePayload) updatePayload.updated_by = updatePayload.updatedBy;

	const [count] = await models.LearningModule.update(updatePayload, { where: { id: moduleId } });
	if (!count) throw new AppError('Learning module not found.', 404, 'NOT_FOUND');
	return getModuleById(moduleId);
};

const getQuizQuestionIdsForModule = async (moduleId, transaction) => {
	const quizzes = await models.Quiz.findAll({ where: { module_id: moduleId }, attributes: ['id'], transaction });
	const quizIds = quizzes.map((quiz) => quiz.id);
	const questions = await models.QuizQuestion.findAll({ where: { quiz_id: { [Op.in]: quizIds } }, attributes: ['id'], transaction });
	const questionIds = questions.map((question) => question.id);
	const attempts = await models.QuizAttempt.findAll({ where: { quiz_id: { [Op.in]: quizIds } }, attributes: ['id'], transaction });
	const attemptIds = attempts.map((attempt) => attempt.id);
	return { quizIds, questionIds, attemptIds };
};

const deleteModule = async (moduleId) => models.sequelize.transaction(async (transaction) => {
	const module = await models.LearningModule.findByPk(moduleId, { transaction });
	if (!module) throw new AppError('Learning module not found.', 404, 'NOT_FOUND');
	const { quizIds, questionIds, attemptIds } = await getQuizQuestionIdsForModule(moduleId, transaction);
	const moduleProgressCount = await models.LearningModuleProgress.count({ where: { module_id: moduleId }, transaction });
	const contentProgressCount = await models.LearningContentProgress.count({ where: { module_id: moduleId }, transaction });
	if (attemptIds.length || moduleProgressCount || contentProgressCount) {
		throw new AppError('A learning module with learner access, progress, or quiz history cannot be deleted.', 409, 'CONFLICT');
	}
	if (questionIds.length) {
		await models.QuizQuestionOption.destroy({ where: { question_id: { [Op.in]: questionIds } }, transaction });
	}
	if (quizIds.length) {
		await models.QuizQuestion.destroy({ where: { quiz_id: { [Op.in]: quizIds } }, transaction });
		await models.Quiz.destroy({ where: { module_id: moduleId }, transaction });
	}
	await models.LearningModuleContent.destroy({ where: { module_id: moduleId }, transaction });
	await models.LearningContentProgress.destroy({ where: { module_id: moduleId }, transaction });
	await models.LearningModuleProgress.destroy({ where: { module_id: moduleId }, transaction });
	await module.destroy({ transaction });
	return true;
});

const activeModuleProgressWhere = (where) => ({
	...where,
	[Op.or]: [{ status: { [Op.ne]: 'access_revoked' } }, { status: null }],
});

const getModuleProgress = async ({ menteeId, moduleId, cycleId }) => {
	const baseWhere = { mentee_id: menteeId, module_id: moduleId };
	const findLegacyProgress = async () => models.LearningModuleProgress.findOne({
		where: activeModuleProgressWhere({ ...baseWhere, cycle_id: null }),
	});
	if (cycleId != null) {
		const progress = await models.LearningModuleProgress.findOne({
			where: activeModuleProgressWhere({ ...baseWhere, cycle_id: cycleId }),
		});
		return progress && await hasValidMentorGrantedAccess(progress) ? progress : null;
	}
	const cycleScopedProgress = await models.LearningModuleProgress.findOne({
		where: activeModuleProgressWhere({ ...baseWhere, cycle_id: { [Op.ne]: null } }),
	});
	if (cycleScopedProgress) {
		return await hasValidMentorGrantedAccess(cycleScopedProgress) ? cycleScopedProgress : null;
	}
	const legacyProgress = await findLegacyProgress();
	return legacyProgress && await hasValidMentorGrantedAccess(legacyProgress) ? legacyProgress : null;
};

const listModuleProgress = async (moduleId) => {
	const records = await models.LearningModuleProgress.findAll({
		where: activeModuleProgressWhere({ module_id: moduleId }),
		include: [{ model: models.User, as: 'mentee', attributes: ['id', 'full_name', 'email'] }],
		order: [['id', 'ASC']],
	});
	return filterValidMentorGrantedAccess(records);
};

const listProgressForMentee = async (menteeId, { mentorId, cycleId } = {}) => {
	const baseWhere = {
		mentee_id: menteeId,
		...(mentorId ? { assigned_by: mentorId } : {}),
	};
	const cycleScopedRecords = cycleId != null
		? await models.LearningModuleProgress.findAll({
			where: activeModuleProgressWhere({ ...baseWhere, cycle_id: cycleId }),
			include: [{
				model: models.LearningModule,
				as: 'module',
				attributes: ['id', 'title', 'status', 'is_published', 'is_authorized'],
				where: { ...isLearnerVisible, status: 'published' },
			}],
			order: [['last_accessed_at', 'DESC'], ['id', 'DESC']],
		})
		: await models.LearningModuleProgress.findAll({
			where: activeModuleProgressWhere({ ...baseWhere, cycle_id: { [Op.ne]: null } }),
			include: [{
				model: models.LearningModule,
				as: 'module',
				attributes: ['id', 'title', 'status', 'is_published', 'is_authorized'],
				where: { ...isLearnerVisible, status: 'published' },
			}],
			order: [['last_accessed_at', 'DESC'], ['id', 'DESC']],
		});
	if (cycleId == null && cycleScopedRecords.length === 0) {
		const legacyRecords = await models.LearningModuleProgress.findAll({
			where: activeModuleProgressWhere({ ...baseWhere, cycle_id: null }),
			include: [{
				model: models.LearningModule,
				as: 'module',
				attributes: ['id', 'title', 'status', 'is_published', 'is_authorized'],
				where: { ...isLearnerVisible, status: 'published' },
			}],
			order: [['last_accessed_at', 'DESC'], ['id', 'DESC']],
		});
		return filterValidMentorGrantedAccess([...cycleScopedRecords, ...legacyRecords]);
	}
	return filterValidMentorGrantedAccess(cycleScopedRecords);
};

// Resource-level assignments can make a published module visible to a mentee
// without creating a full module enrollment/progress record.
const listResourceAssignedModulesForMentee = async (menteeId) => {
	const assignments = await models.ResourceAssignment.findAll({
		where: {
			mentee_id: menteeId,
			assignment_status: { [Op.in]: ['active', 'completed'] },
			revoked_at: null,
		},
		include: [{
			model: models.Resource,
			as: 'resource',
			required: true,
			include: [{
				model: models.LearningModule,
				as: 'module',
				required: true,
				where: { ...isLearnerVisible, status: 'published' },
				attributes: ['id', 'title', 'description', 'status', 'is_published', 'is_authorized', 'thematic_area_id', 'order_number'],
			}],
		}],
		order: [['assigned_at', 'DESC'], ['id', 'DESC']],
	});

	const latestResourceAssignments = new Map();
	for (const assignment of assignments) {
		const resource = assignment.resource;
		if (!resource || ['FACILITATOR_GUIDE', 'ANSWER_KEY'].includes(resource.category)) continue;
		if (!latestResourceAssignments.has(Number(resource.id))) {
			latestResourceAssignments.set(Number(resource.id), assignment);
		}
	}

	const modules = new Map();
	for (const assignment of latestResourceAssignments.values()) {
		const resource = assignment.resource;
		const module = resource?.module;
		if (!module || modules.has(Number(module.id))) continue;
		modules.set(Number(module.id), {
			id: `resource-assignment-${module.id}`,
			mentee_id: menteeId,
			module_id: module.id,
			assigned_by: assignment.assigned_by,
			assigned_at: assignment.assigned_at,
			status: 'not_started',
			completion_percentage: 0,
			module,
		});
	}
	return [...modules.values()];
};

const hasActiveResourceAssignmentForMenteeModule = async (menteeId, moduleId) => {
	const assignment = await models.ResourceAssignment.findOne({
		where: {
			mentee_id: menteeId,
			assignment_status: { [Op.in]: ['active', 'completed'] },
			revoked_at: null,
		},
		include: [{
			model: models.Resource,
			as: 'resource',
			required: true,
			where: {
				module_id: moduleId,
				[Op.or]: [
					{ category: null },
					{ category: { [Op.notIn]: ['FACILITATOR_GUIDE', 'ANSWER_KEY'] } },
				],
			},
		}],
		attributes: ['id'],
	});
	return Boolean(assignment);
};

const assignModuleToMentee = async ({ moduleId, menteeId, mentorId, cycleId }) => {
	const scopeWhere = cycleId != null ? { module_id: moduleId, mentee_id: menteeId, cycle_id: cycleId } : { module_id: moduleId, mentee_id: menteeId, cycle_id: null };
	const existing = await models.LearningModuleProgress.findOne({ where: scopeWhere });
	if (existing) {
		await existing.update({
			assigned_by: mentorId,
			assigned_at: existing.assigned_at || new Date(),
			status: existing.status === 'access_revoked' ? 'not_started' : existing.status,
			cycle_id: cycleId ?? existing.cycle_id ?? null,
		});
		return existing;
	}
	return models.LearningModuleProgress.create({
		module_id: moduleId,
		mentee_id: menteeId,
		cycle_id: cycleId ?? null,
		assigned_by: mentorId,
		assigned_at: new Date(),
		status: 'not_started',
		completion_percentage: 0,
	});
};

const revokeModuleAssignment = async ({ moduleId, menteeId, mentorId, cycleId }) => {
	const scopeWhere = cycleId != null
		? { module_id: moduleId, mentee_id: menteeId, cycle_id: cycleId, assigned_by: mentorId, status: { [Op.ne]: 'access_revoked' } }
		: { module_id: moduleId, mentee_id: menteeId, cycle_id: null, assigned_by: mentorId, status: { [Op.ne]: 'access_revoked' } };
	const [updated] = await models.LearningModuleProgress.update({ status: 'access_revoked' }, { where: scopeWhere });
	return Boolean(updated);
};

const listMentorThematicAreaIds = async (mentorId) => {
	if (!mentorId || !models.Assignment) return [];
	const assignments = await models.Assignment.findAll({
		where: {
			mentor_id: mentorId,
			thematic_area_id: { [Op.ne]: null },
			status: { [Op.in]: ACTIVE_ASSIGNMENT_STATUSES },
			unassigned_at: null,
		},
		attributes: ['thematic_area_id'],
	});
	return [...new Set(assignments
		.map((entry) => Number(entry.thematic_area_id))
		.filter((value) => Number.isFinite(value) && value > 0))];
};

const listMentorModuleIds = async (mentorId) => {
	const thematicAreaIds = await listMentorThematicAreaIds(mentorId);
	if (!thematicAreaIds.length) return [];
	const thematicAreaModules = await models.LearningModule.findAll({
		where: {
			thematic_area_id: { [Op.in]: thematicAreaIds },
			is_published: true,
			is_authorized: true,
			status: 'published',
		},
		attributes: ['id'],
	});
	return [...new Set(thematicAreaModules.map((module) => Number(module.id)).filter((value) => Number.isFinite(value) && value > 0))];
};

const hasModuleMentorAccess = async ({ mentorId, moduleId }) => {
	const module = await models.LearningModule.findByPk(moduleId, { attributes: ['id', 'thematic_area_id'] });
	if (!module || !module.thematic_area_id) return false;
	return Boolean(await models.Assignment.findOne({
		where: {
			mentor_id: mentorId,
			thematic_area_id: module.thematic_area_id,
			status: { [Op.in]: ACTIVE_ASSIGNMENT_STATUSES },
			unassigned_at: null,
		},
		attributes: ['id'],
	}));
};

const listActiveMentorThematicAreaIds = listMentorThematicAreaIds;

const listModuleIdsForThematicAreas = async (thematicAreaIds = []) => {
	const normalizedIds = [...new Set((thematicAreaIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
	if (!normalizedIds.length) return [];
	const modules = await models.LearningModule.findAll({
		where: { thematic_area_id: { [Op.in]: normalizedIds } },
		attributes: ['id'],
	});
	return modules.map((module) => module.id);
};

const hasValidMentorGrantedAccess = async (progress) => {
	const mentorId = progress.assigned_by;
	if (!mentorId) return false;
	const mentor = await models.User.findOne({
		where: { id: mentorId, role: 'mentor' },
		attributes: ['id'],
	});
	if (!mentor) return false;
	const [moduleAccess, mentorAssignment] = await Promise.all([
		hasModuleMentorAccess({ mentorId, moduleId: progress.module_id }),
		hasActiveMentorAssignment({ mentorId, menteeId: progress.mentee_id, moduleId: progress.module_id }),
	]);
	return moduleAccess && mentorAssignment;
};

const filterValidMentorGrantedAccess = async (records) => {
	const candidates = records.filter((progress) => progress.assigned_by != null);
	if (candidates.length === 0) return [];
	const validity = await Promise.all(candidates.map(async (progress) => {
		const mentorId = Number(progress.assigned_by);
		const mentor = await models.User.findOne({
			where: { id: mentorId, role: 'mentor' },
			attributes: ['id'],
		});
		if (!mentor) return false;
		const [moduleAccess, mentorAssignment] = await Promise.all([
			hasModuleMentorAccess({ mentorId, moduleId: progress.module_id }),
			hasActiveMentorAssignment({
				mentorId,
				menteeId: progress.mentee_id,
				moduleId: progress.module_id,
			}),
		]);
		return moduleAccess && mentorAssignment;
	}));
	return candidates.filter((progress, index) => validity[index]);
};

const getQuizByModule = async (moduleId, { includeCorrectAnswers = false, learnerVisible = false } = {}) => {
	const where = { module_id: moduleId };
	const quizCount = await models.Quiz.count({ where });
	if (quizCount > 1) {
		throw new AppError('Multiple quizzes are configured for this module; resolve the duplicate quiz configuration before learner access.', 409, 'QUIZ_CONFIGURATION_CONFLICT');
	}
	return models.Quiz.findOne({
		where: { ...where, ...(learnerVisible ? isLearnerVisible : {}) },
		order: [['id', 'ASC']],
		include: [{
			model: models.QuizQuestion,
			as: 'questions',
			attributes: [
				'id', 'quiz_id', 'prompt', 'question_type', 'clinical_context', 'points', 'order_number',
				...(includeCorrectAnswers ? ['explanation'] : []),
			],
			include: [{
				model: models.QuizQuestionOption,
				as: 'options',
				...(includeCorrectAnswers ? {} : { attributes: ['id', 'question_id', 'text', 'order_number'] }),
			}],
		}],
	});
};

const getQuizById = async (quizId, { includeCorrectAnswers = false, transaction } = {}) => models.Quiz.findByPk(quizId, {
	transaction,
	include: [{
		model: models.QuizQuestion,
		as: 'questions',
		attributes: [
			'id', 'quiz_id', 'prompt', 'question_type', 'clinical_context', 'points', 'order_number',
			...(includeCorrectAnswers ? ['explanation'] : []),
		],
		include: [{
			model: models.QuizQuestionOption,
			as: 'options',
			...(includeCorrectAnswers ? {} : { attributes: ['id', 'question_id', 'text', 'order_number'] }),
		}],
	}],
});

const createQuiz = async (moduleId, payload, createdBy) => models.sequelize.transaction(async (transaction) => {
	const quiz = await models.Quiz.create({
		module_id: moduleId,
		title: payload.title,
		description: payload.description || null,
		assessment_stage: payload.assessmentStage,
		pass_score: payload.passScore ?? 0,
		time_limit_minutes: payload.timeLimitMinutes ?? 0,
		attempt_limit: payload.attemptLimit ?? 1,
		is_published: payload.isPublished ?? false,
		is_authorized: payload.isAuthorized ?? false,
		created_by: createdBy,
	}, { transaction });
	for (const question of payload.questions || []) {
		await createQuizQuestion(quiz.id, question, { transaction });
	}
	return getQuizById(quiz.id, { includeCorrectAnswers: true, transaction });
});

const updateQuiz = async (quizId, payload = {}) => {
	const quiz = await models.Quiz.findByPk(quizId);
	if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
	const updates = {};
	if ('title' in payload) updates.title = payload.title;
	if ('description' in payload) updates.description = payload.description;
	if ('assessmentStage' in payload) updates.assessment_stage = payload.assessmentStage;
	if ('passScore' in payload) updates.pass_score = payload.passScore;
	if ('timeLimitMinutes' in payload) updates.time_limit_minutes = payload.timeLimitMinutes;
	if ('attemptLimit' in payload) updates.attempt_limit = payload.attemptLimit;
	if ('isPublished' in payload) updates.is_published = payload.isPublished;
	if ('isAuthorized' in payload) updates.is_authorized = payload.isAuthorized;
	await quiz.update(updates);
	return getQuizById(quizId, { includeCorrectAnswers: true });
};

const getQuizForLearner = async (quizId) => getQuizById(quizId);

const getQuizQuestion = async (questionId, { transaction } = {}) => models.QuizQuestion.findByPk(questionId, {
	include: [{ model: models.QuizQuestionOption, as: 'options', separate: true, order: [['order_number', 'ASC'], ['id', 'ASC']] }],
	transaction,
});

const listQuizQuestions = async (quizId) => models.QuizQuestion.findAll({
	where: { quiz_id: quizId },
	attributes: ['id', 'quiz_id', 'prompt', 'question_type', 'clinical_context', 'points', 'order_number'],
	include: [{
		model: models.QuizQuestionOption,
		as: 'options',
		attributes: ['id', 'question_id', 'text', 'order_number'],
	}],
	order: [['order_number', 'ASC'], ['id', 'ASC']],
});

const assertQuizHasNoAttempts = async (quizId) => {
	const questionCount = await models.QuizQuestion.count({ where: { quiz_id: quizId } });
	if (questionCount > 0 && await models.QuizAttempt.count({ where: { quiz_id: quizId } })) {
		throw new AppError('Quiz questions cannot be changed after learner attempts exist.', 409, 'CONFLICT');
	}
};

const createQuizQuestion = async (quizId, payload, { transaction } = {}) => {
	await assertQuizHasNoAttempts(quizId);
	const question = await models.QuizQuestion.create({
		quiz_id: quizId,
		prompt: payload.prompt,
		question_type: payload.questionType,
		clinical_context: payload.clinicalContext,
		points: payload.points,
		explanation: payload.explanation,
		order_number: payload.orderNumber,
	}, { transaction });
	for (const option of payload.options || []) {
		await createQuestionOption(question.id, option, { transaction });
	}
	return getQuizQuestion(question.id, { transaction });
};

const updateQuizQuestion = async (questionId, payload) => {
	const question = await models.QuizQuestion.findByPk(questionId);
	if (!question) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	await assertQuizHasNoAttempts(question.quiz_id);
	await question.update({
		prompt: payload.prompt,
		question_type: payload.questionType,
		clinical_context: payload.clinicalContext,
		points: payload.points,
		explanation: payload.explanation,
		order_number: payload.orderNumber,
	});
	return getQuizQuestion(questionId);
};

const deleteQuizQuestion = async (questionId) => {
	const question = await models.QuizQuestion.findByPk(questionId);
	if (!question) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	await assertQuizHasNoAttempts(question.quiz_id);
	await models.QuizQuestionOption.destroy({ where: { question_id: questionId } });
	await question.destroy();
};

const createQuestionOption = async (questionId, payload, { transaction } = {}) => {
	const question = await models.QuizQuestion.findByPk(questionId, { transaction });
	if (!question) throw new AppError('Quiz question not found.', 404, 'NOT_FOUND');
	await assertQuizHasNoAttempts(question.quiz_id);
	return models.QuizQuestionOption.create({
		question_id: questionId,
		text: payload.text,
		is_correct: payload.isCorrect,
		order_number: payload.orderNumber,
	}, { transaction });
};

const updateQuestionOption = async (optionId, payload) => {
	const option = await models.QuizQuestionOption.findByPk(optionId);
	if (!option) throw new AppError('Question option not found.', 404, 'NOT_FOUND');
	const question = await models.QuizQuestion.findByPk(option.question_id);
	await assertQuizHasNoAttempts(question.quiz_id);
	await option.update({ text: payload.text, is_correct: payload.isCorrect, order_number: payload.orderNumber });
	return option;
};

const deleteQuestionOption = async (optionId) => {
	const option = await models.QuizQuestionOption.findByPk(optionId);
	if (!option) throw new AppError('Question option not found.', 404, 'NOT_FOUND');
	const question = await models.QuizQuestion.findByPk(option.question_id);
	await assertQuizHasNoAttempts(question.quiz_id);
	await option.destroy();
};

const startQuizAttempt = async ({ quizId, menteeId }) => {
	return models.sequelize.transaction(async (transaction) => {
		const quiz = await models.Quiz.findByPk(quizId, { transaction, lock: transaction.LOCK.UPDATE });
		if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
		const activeAttempt = await models.QuizAttempt.findOne({
			where: { quiz_id: quizId, mentee_id: menteeId, status: 'in_progress' },
			order: [['attempt_number', 'DESC']],
			transaction,
		});
		if (activeAttempt) return activeAttempt;
		const attemptNumber = await models.QuizAttempt.count({ where: { quiz_id: quizId, mentee_id: menteeId }, transaction }) + 1;
		if (quiz.attempt_limit > 0 && attemptNumber > quiz.attempt_limit) {
			throw new AppError('Quiz attempt limit reached.', 409, 'CONFLICT');
		}
		const attemptedAt = new Date();
		return models.QuizAttempt.create({
			quiz_id: quizId,
			mentee_id: menteeId,
			attempt_number: attemptNumber,
			score: 0,
			passed: false,
			status: 'in_progress',
			started_at: attemptedAt,
			attempted_at: attemptedAt,
		}, { transaction });
	});
};

const submitQuiz = async ({ quizId, menteeId, answers = [] }) => {
	return models.sequelize.transaction(async (transaction) => {
		const quiz = await getQuizById(quizId, { includeCorrectAnswers: true, transaction });
		if (!quiz) throw new AppError('Quiz not found.', 404, 'NOT_FOUND');
		const attempt = await models.QuizAttempt.findOne({
			where: { quiz_id: quizId, mentee_id: menteeId, status: 'in_progress' },
			order: [['attempt_number', 'DESC']],
			transaction,
			lock: transaction.LOCK.UPDATE,
		});
		if (!attempt) throw new AppError('Start a quiz attempt before submitting answers.', 409, 'CONFLICT');

		const questionMap = new Map((quiz.questions || []).map((question) => [Number(question.id), question]));
		const answeredIds = new Set();
		const totalPoints = (quiz.questions || []).reduce((sum, question) => sum + Number(question.points || 1), 0);
		let score = 0;
		const answerRecords = [];
		for (const answer of answers) {
			const question = questionMap.get(Number(answer.questionId));
			if (!question) {
				const validIds = Array.from(questionMap.keys());
				throw new AppError(
					'An answer references a question outside this quiz.',
					400,
					'VALIDATION_ERROR',
					[{
						field: 'answers',
						questionId: answer.questionId,
						message: validIds.length
							? `Question ID ${answer.questionId} does not belong to quiz ${quizId}. Valid question IDs are: ${validIds.join(', ')}.`
							: `Quiz ${quizId} has no questions configured.`
					}]
				);
			}
			if (answeredIds.has(Number(question.id))) throw new AppError('Each quiz question may only be answered once.', 400, 'VALIDATION_ERROR');
			answeredIds.add(Number(question.id));
			const selectedOptionIds = [...new Set([
				...(Array.isArray(answer.selectedOptionIds) ? answer.selectedOptionIds : []),
				...(answer.selectedOptionId === null || answer.selectedOptionId === undefined ? [] : [answer.selectedOptionId]),
			].map(Number))];
			const optionIds = new Set((question.options || []).map((option) => Number(option.id)));
			if (selectedOptionIds.some((id) => !optionIds.has(id))) {
				const invalidOptionIds = selectedOptionIds.filter((id) => !optionIds.has(id));
				throw new AppError(
					'A selected option does not belong to its question.',
					400,
					'VALIDATION_ERROR',
					[{
						field: 'answers',
						questionId: question.id,
						invalidOptionIds,
						validOptionIds: Array.from(optionIds),
						message: `Selected option(s) [${invalidOptionIds.join(', ')}] do not belong to question ${question.id}.`
					}]
				);
			}
			const correctOptionIds = (question.options || []).filter((option) => option.is_correct).map((option) => Number(option.id));
			const isCorrect = selectedOptionIds.length > 0
				&& selectedOptionIds.length === correctOptionIds.length
				&& selectedOptionIds.every((id) => correctOptionIds.includes(id));
			const points = Number(question.points || 1);
			if (isCorrect) score += points;
			answerRecords.push({ questionId: question.id, selectedOptionIds, isCorrect, pointsAwarded: isCorrect ? points : 0 });
		}
		for (const question of quiz.questions || []) {
			if (!answeredIds.has(Number(question.id))) {
				answerRecords.push({ questionId: question.id, selectedOptionIds: [], isCorrect: false, pointsAwarded: 0 });
			}
		}

		const now = new Date();
		for (const answer of answerRecords) {
			const answerRecord = await models.QuizAttemptAnswer.create({
				attempt_id: attempt.id,
				question_id: answer.questionId,
				selected_option_id: answer.selectedOptionIds[0] ?? null,
				is_correct: answer.isCorrect,
				points_awarded: answer.pointsAwarded,
			}, { transaction });
			if (answer.selectedOptionIds.length) {
				await models.QuizAttemptAnswerOption.bulkCreate(answer.selectedOptionIds.map((optionId) => ({
					answer_id: answerRecord.id,
					option_id: optionId,
				})), { transaction });
			}
		}

		const passed = totalPoints > 0 && score >= Number(quiz.pass_score ?? 0);
		await attempt.update({
			score,
			passed,
			status: 'completed',
			completed_at: now,
			ended_at: now,
			updated_at: now,
		}, { transaction });
		return {
			id: attempt.id,
			quizId,
			menteeId,
			score,
			totalPoints,
			passed,
			status: 'completed',
			submittedAt: now,
			answers: answerRecords,
		};
	});
};

const listQuizAttempts = async ({ quizId, menteeId, completedOnly = false }) => models.QuizAttempt.findAll({
	where: { quiz_id: quizId, mentee_id: menteeId, ...(completedOnly ? { status: 'completed' } : {}) },
	order: [['attempt_number', 'DESC']],
});

const hasActiveMentorAssignment = async ({ mentorId, menteeId, moduleId }) => {
	const mentor = await models.User.findByPk(mentorId, { attributes: ['id', 'role', 'facility_id'] });
	if (!mentor || mentor.role !== 'mentor') return false;
	const where = {
		mentor_id: mentorId,
		status: { [Op.in]: ACTIVE_ASSIGNMENT_STATUSES },
		unassigned_at: null,
	};
	if (menteeId) {
		const mentee = await models.User.findByPk(menteeId, { attributes: ['id', 'role', 'facility_id'] });
		if (!mentee || mentee.role !== 'mentee') {
			return false;
		}
		if (mentor.facility_id && mentee.facility_id && Number(mentee.facility_id) !== Number(mentor.facility_id)) {
			return false;
		}
		where.mentee_id = menteeId;
		if (mentor.facility_id) {
			where.facility_id = mentor.facility_id;
		}
	}
	if (moduleId) {
		const module = await models.LearningModule.findByPk(moduleId, { attributes: ['thematic_area_id'] });
		if (module?.thematic_area_id) {
			where.thematic_area_id = module.thematic_area_id;
		}
	}
	return Boolean(await models.Assignment.findOne({ where, attributes: ['id'] }));
};

const isMentee = async (menteeId) => {
	const user = await models.User.findByPk(menteeId, { attributes: ['id', 'role'] });
	return String(user?.role || '').toLowerCase() === 'mentee';
};

const getUserById = async (userId) => models.User.findByPk(userId, {
	attributes: ['id', 'role', 'facility_id'],
});

const isMentor = async (mentorId) => {
	const user = await models.User.findByPk(mentorId, { attributes: ['id', 'role'] });
	return String(user?.role || '').toLowerCase() === 'mentor';
};

const isLearningAdmin = async (userId) => {
	const user = await models.User.findByPk(userId, { attributes: ['id', 'role'] });
	return ['admin', 'facility_admin'].includes(String(user?.role || '').toLowerCase());
};

module.exports = {
	listModules,
	listModuleIdsForFacility,
	isModuleInFacilityScope,
	isThematicAreaInFacilityScope,
	getModuleById,
	createModule,
	updateModule,
	deleteModule,
	listMentorModuleIds,
	listActiveMentorThematicAreaIds,
	listModuleIdsForThematicAreas,
	hasModuleMentorAccess,
	listModuleProgress,
	getModuleProgress,
	listProgressForMentee,
	listResourceAssignedModulesForMentee,
	hasActiveResourceAssignmentForMenteeModule,
	assignModuleToMentee,
	revokeModuleAssignment,
	getQuizByModule,
	getQuizById,
	createQuiz,
	updateQuiz,
	getQuizForLearner,
	getQuizQuestion,
	listQuizQuestions,
	createQuizQuestion,
	updateQuizQuestion,
	deleteQuizQuestion,
	createQuestionOption,
	updateQuestionOption,
	deleteQuestionOption,
	startQuizAttempt,
	submitQuiz,
	listQuizAttempts,
	hasActiveMentorAssignment,
	isMentor,
	isLearningAdmin,
	isMentee,
	getUserById,
};
