const { Op } = require('sequelize');
const models = require('../models');
const AppError = require('../errors/app-error');
const LearningMaterialCategory = require('../enums/learning-material-category.enum');

const NON_MENTEE_CATEGORIES = [
	LearningMaterialCategory.FACILITATOR_GUIDE,
	LearningMaterialCategory.ANSWER_KEY,
];

const positiveId = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const contextKey = ({ facility_id, cycle_id, thematic_area_id }) => (
	`${facility_id}:${cycle_id}:${thematic_area_id}`
);

function getLatestAssignments(assignments) {
	const latest = new Map();
	for (const assignment of assignments) {
		const resourceId = Number(assignment.resource_id);
		const current = latest.get(resourceId);
		const assignedAt = new Date(assignment.assigned_at || 0).getTime();
		const currentAssignedAt = current ? new Date(current.assigned_at || 0).getTime() : -Infinity;
		if (!current
			|| assignedAt > currentAssignedAt
			|| (assignedAt === currentAssignedAt && Number(assignment.id) > Number(current.id))) {
			latest.set(resourceId, assignment);
		}
	}
	return latest;
}

function assignmentIsComplete(assignment) {
	return Boolean(assignment
		&& assignment.assignment_status !== 'revoked'
		&& !assignment.revoked_at
		&& (assignment.completed_at || assignment.assignment_status === 'completed'));
}

function isEligibleRequiredResource(resource) {
	return Boolean(resource.is_required)
		&& !NON_MENTEE_CATEGORIES.includes(resource.category);
}

function calculateResourceProgress(requiredResources, assignments) {
	const uniqueResources = [...new Map(requiredResources
		.filter(isEligibleRequiredResource)
		.map((resource) => [Number(resource.id), resource])).values()];
	const resourceIds = uniqueResources.map((resource) => Number(resource.id));
	const latestAssignments = getLatestAssignments(assignments);
	const completedIds = new Set(resourceIds.filter((resourceId) => (
		assignmentIsComplete(latestAssignments.get(resourceId))
	)));
	const totalRequiredResources = uniqueResources.length;
	const completedRequiredResources = completedIds.size;
	return {
		totalRequiredResources,
		completedRequiredResources,
		incompleteRequiredResources: totalRequiredResources - completedRequiredResources,
		completionPercentage: totalRequiredResources
			? Math.round((completedRequiredResources / totalRequiredResources) * 100)
			: 0,
		resources: uniqueResources.map((resource) => {
			const assignment = latestAssignments.get(Number(resource.id));
			return {
				id: resource.id,
				title: resource.title,
				completed: completedIds.has(Number(resource.id)),
				completedAt: assignmentIsComplete(assignment) ? assignment.completed_at || null : null,
			};
		}),
	};
}

async function getValidContexts({ menteeId, module }) {
	if (!module.thematic_area_id) return [];
	const assignments = await models.Assignment.findAll({
		where: {
			mentee_id: menteeId,
			thematic_area_id: module.thematic_area_id,
			status: { [Op.in]: ['assigned', 'active'] },
			unassigned_at: null,
			facility_id: { [Op.ne]: null },
			cycle_id: { [Op.ne]: null },
		},
		attributes: ['facility_id', 'cycle_id', 'thematic_area_id'],
		order: [['assigned_at', 'DESC'], ['id', 'DESC']],
	});
	const candidates = [...new Map(assignments
		.filter((entry) => positiveId(entry.facility_id)
			&& positiveId(entry.cycle_id)
			&& positiveId(entry.thematic_area_id))
		.map((entry) => [contextKey(entry), entry])).values()];
	if (!candidates.length) return [];

	const cycleIds = [...new Set(candidates.map((entry) => Number(entry.cycle_id)))];
	const facilityIds = [...new Set(candidates.map((entry) => Number(entry.facility_id)))];
	const thematicAreaIds = [...new Set(candidates.map((entry) => Number(entry.thematic_area_id)))];
	const [cycleFacilities, cycleThematicAreas] = await Promise.all([
		models.CycleFacility.findAll({
			where: { cycle_id: { [Op.in]: cycleIds }, facility_id: { [Op.in]: facilityIds } },
			attributes: ['cycle_id', 'facility_id'],
		}),
		models.CycleThematicArea.findAll({
			where: { cycle_id: { [Op.in]: cycleIds }, thematic_area_id: { [Op.in]: thematicAreaIds } },
			attributes: ['cycle_id', 'thematic_area_id'],
		}),
	]);
	const validFacilityPairs = new Set(cycleFacilities.map((entry) => (
		`${Number(entry.cycle_id)}:${Number(entry.facility_id)}`
	)));
	const validThematicPairs = new Set(cycleThematicAreas.map((entry) => (
		`${Number(entry.cycle_id)}:${Number(entry.thematic_area_id)}`
	)));
	return candidates.filter((entry) => (
		validFacilityPairs.has(`${Number(entry.cycle_id)}:${Number(entry.facility_id)}`)
		&& validThematicPairs.has(`${Number(entry.cycle_id)}:${Number(entry.thematic_area_id)}`)
	));
}

async function resolveContext({ menteeId, module, cycleId }) {
	if (!positiveId(menteeId)) throw new AppError('Mentee context is invalid.', 400, 'VALIDATION_ERROR');
	if (cycleId != null && !positiveId(cycleId)) {
		throw new AppError('cycleId must be a positive integer.', 400, 'VALIDATION_ERROR');
	}
	const mentee = await models.User.findByPk(menteeId, { attributes: ['id', 'role'] });
	if (!mentee || String(mentee.role).toLowerCase() !== 'mentee') {
		throw new AppError('Mentee not found.', 404, 'NOT_FOUND');
	}
	const contexts = await getValidContexts({ menteeId, module });
	const selected = cycleId == null
		? contexts
		: contexts.filter((entry) => Number(entry.cycle_id) === Number(cycleId));
	if (!selected.length) {
		throw new AppError('No valid mentorship context exists for this module and mentee.', 403, 'FORBIDDEN');
	}
	if (selected.length > 1) {
		throw new AppError('Multiple valid mentorship contexts match this module; provide a cycleId and resolve any remaining context ambiguity.', 400, 'AMBIGUOUS_CYCLE_CONTEXT');
	}
	return selected[0];
}

async function calculateProgress({ menteeId, module, context, transaction }) {
	const requiredResources = await models.Resource.findAll({
		where: {
			module_id: module.id,
			is_required: true,
			[Op.or]: [
				{ category: { [Op.notIn]: NON_MENTEE_CATEGORIES } },
				{ category: null },
			],
		},
		attributes: ['id', 'title', 'category', 'is_required'],
		order: [['id', 'ASC']],
		transaction,
	});
	const eligibleResources = requiredResources.filter(isEligibleRequiredResource);
	const resourceIds = eligibleResources.map((resource) => resource.id);
	const assignments = resourceIds.length
		? await models.ResourceAssignment.findAll({
			where: {
				mentee_id: menteeId,
				resource_id: { [Op.in]: resourceIds },
				module_id: module.id,
				cycle_id: context.cycle_id,
				facility_id: context.facility_id,
				thematic_area_id: context.thematic_area_id,
			},
			attributes: [
				'id', 'resource_id', 'assignment_status', 'completed_at', 'revoked_at', 'assigned_at',
			],
			order: [['assigned_at', 'DESC'], ['id', 'DESC']],
			transaction,
		})
		: [];
	return {
		moduleId: Number(module.id),
		cycleId: Number(context.cycle_id),
		...calculateResourceProgress(eligibleResources, assignments),
	};
}

async function getProgress({ menteeId, module, cycleId }) {
	const context = await resolveContext({ menteeId, module, cycleId });
	const [calculation, progress] = await Promise.all([
		calculateProgress({ menteeId, module, context }),
		models.LearningModuleProgress.findOne({
			where: { mentee_id: menteeId, module_id: module.id, cycle_id: context.cycle_id },
		}),
	]);
	return {
		...calculation,
		status: progress?.status === 'completed'
			&& calculation.totalRequiredResources > 0
			&& calculation.completionPercentage === 100
			? 'completed'
			: (progress?.started_at ? 'in_progress' : (progress?.status || 'not_started')),
		startedAt: progress?.started_at || null,
		completedAt: progress?.completed_at || null,
		lastAccessedAt: progress?.last_accessed_at || null,
	};
}

async function updateProgressForContext({ menteeId, moduleId, context, transaction, confirm = false }) {
	const module = await models.LearningModule.findByPk(moduleId, { transaction });
	if (!module) throw new AppError('Learning module not found.', 404, 'NOT_FOUND');
	const calculation = await calculateProgress({ menteeId, module, context, transaction });
	if (confirm && calculation.totalRequiredResources === 0) {
		throw new AppError('This module has no eligible required learning Resources.', 409, 'CONFLICT');
	}
	if (confirm && calculation.incompleteRequiredResources > 0) {
		throw new AppError('Complete all required Resources before confirming the module.', 409, 'CONFLICT');
	}
	const now = new Date();
	const [progress] = await models.LearningModuleProgress.findOrCreate({
		where: {
			mentee_id: menteeId,
			module_id: moduleId,
			cycle_id: context.cycle_id,
		},
		defaults: {
			mentee_id: menteeId,
			module_id: moduleId,
			cycle_id: context.cycle_id,
			status: confirm ? 'completed' : 'in_progress',
			completion_percentage: confirm ? 100 : calculation.completionPercentage,
			started_at: now,
			last_accessed_at: now,
			completed_at: confirm ? now : null,
		},
		transaction,
	});
	const updates = {
		started_at: progress.started_at || now,
		last_accessed_at: now,
		completion_percentage: confirm ? 100 : calculation.completionPercentage,
		status: confirm
			? 'completed'
			: (progress.status === 'completed'
				&& calculation.totalRequiredResources > 0
				&& calculation.completionPercentage === 100
				? 'completed'
				: 'in_progress'),
	};
	if (confirm) updates.completed_at = progress.completed_at || now;
	await progress.update(updates, { transaction });
	return progress;
}

async function confirmProgress({ menteeId, module, cycleId }) {
	const context = await resolveContext({ menteeId, module, cycleId });
	return models.sequelize.transaction((transaction) => updateProgressForContext({
		menteeId,
		moduleId: module.id,
		context,
		transaction,
		confirm: true,
	}));
}

async function refreshAfterResourceCompletion({ menteeId, assignment, transaction }) {
	const scopeIds = [
		assignment.module_id,
		assignment.cycle_id,
		assignment.facility_id,
		assignment.thematic_area_id,
	];
	if (!scopeIds.every(positiveId)) {
		throw new AppError('Resource assignment is missing a valid module and mentorship scope snapshot.', 409, 'INVALID_ASSIGNMENT_CONTEXT');
	}
	const module = await models.LearningModule.findByPk(assignment.module_id, { transaction });
	if (!module || Number(module.thematic_area_id) !== Number(assignment.thematic_area_id)) {
		throw new AppError('Resource assignment scope does not match the learning module.', 409, 'INVALID_ASSIGNMENT_CONTEXT');
	}
	const context = {
		facility_id: Number(assignment.facility_id),
		cycle_id: Number(assignment.cycle_id),
		thematic_area_id: Number(assignment.thematic_area_id),
	};
	const validContexts = await getValidContexts({ menteeId, module });
	if (!validContexts.some((entry) => contextKey(entry) === contextKey(context))) {
		throw new AppError('Resource assignment mentorship context is no longer valid.', 403, 'FORBIDDEN');
	}
	return updateProgressForContext({
		menteeId,
		moduleId: assignment.module_id,
		context,
		transaction,
	});
}

module.exports = {
	getProgress,
	confirmProgress,
	refreshAfterResourceCompletion,
	getLatestAssignments,
	assignmentIsComplete,
	calculateProgress,
	calculateResourceProgress,
	isEligibleRequiredResource,
	resolveContext,
};
