const AppError = require('../errors/app-error');
const repository = require('../repositories/logbook.repository');
const { canAccessFacility, canAccessUser, SYSTEM_ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../constants/roles.constants');
const { sequelize } = require('../models');
const { User, ClinicalEncounter, Assignment } = require('../models');
const LogbookStatus = require('../enums/logbook-status.enum');

function toLogbookResponse(entry) {
	if (!entry) return null;
	const value = entry.toJSON ? entry.toJSON() : entry;
	const response = {
		id: value.id,
		mentee_id: value.mentee_id,
		encounter_id: value.encounter_id,
		thematic_area_id: value.thematic_area_id,
		procedure_type: value.procedure_type,
		hours: value.hours,
		clinical_notes: value.clinical_notes,
		status: value.status,
		revision_reason: value.revision_reason,
		outcome: value.outcome,
		goal_progress: value.goal_progress,
		mentor_approval: value.mentor_approval,
		approved_by: value.approved_by,
		approved_at: value.approved_at,
		created_by: value.created_by,
		logged_at: value.logged_at,
		updated_at: value.updated_at,
	};

	// Include related data if available
	if (value.mentee) {
		response.mentee = {
			id: value.mentee.id,
			full_name: value.mentee.full_name,
			email: value.mentee.email,
			facility_id: value.mentee.facility_id,
		};
	}
	if (value.encounter) {
		response.encounter = {
			id: value.encounter.id,
			clinical_setting: value.encounter.clinical_setting,
			facility_id: value.encounter.facility_id,
		};
	}
	if (value.thematicArea) {
		response.thematic_area = {
			id: value.thematicArea.id,
			name: value.thematicArea.name,
		};
	}
	if (value.createdBy) {
		response.created_by_user = {
			id: value.createdBy.id,
			full_name: value.createdBy.full_name,
		};
	}
	if (value.approvedBy) {
		response.approved_by_user = {
			id: value.approvedBy.id,
			full_name: value.approvedBy.full_name,
		};
	}

	return response;
}

function buildPagination(page = 1, limit = 20) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

async function listLogbook(filters = {}, actor) {
	const where = {};

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin') {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		// Filter by mentee's facility - requires joining mentee table
		// For now, apply in application layer after query
	}

	// Mentees see only their own entries
	if (actor && actor.role === 'mentee') {
		where.mentee_id = actor.id;
	}

	// Mentors see their assigned mentees' entries
	if (actor && actor.role === 'mentor') {
		// For now, apply in application layer after query
	}

	if (filters.mentee_id) where.mentee_id = filters.mentee_id;
	if (filters.status) where.status = filters.status;
	if (filters.thematic_area_id) where.thematic_area_id = filters.thematic_area_id;

	const pagination = buildPagination(filters.page, filters.limit);
	const { count, rows } = await repository.findMany(where, {
		page: pagination.page,
		limit: pagination.limit,
		order: [['logged_at', 'DESC']],
	});

	// Apply facility scope filtering for facility admins
	let filteredRows = rows;
	if (actor && actor.role === 'facility_admin' && actor.facility_id) {
		filteredRows = rows.filter((row) => row.mentee && row.mentee.facility_id === actor.facility_id);
	}

	// Apply mentor scope filtering for mentors
	if (actor && actor.role === 'mentor') {
		const assignedMenteeIds = await Assignment.findAll({
			where: { mentor_id: actor.id, status: 'assigned' },
			attributes: ['mentee_id'],
		}).then((assignments) => assignments.map((a) => a.mentee_id));
		filteredRows = filteredRows.filter((row) => assignedMenteeIds.includes(row.mentee_id));
	}

	return {
		items: filteredRows.map(toLogbookResponse),
		total: filteredRows.length,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil(filteredRows.length / pagination.limit)),
	};
}

async function getLogbook(id, actor) {
	const entry = await repository.findById(id);
	if (!entry) throw new AppError('Logbook entry not found.', 404, 'LOGBOOK_NOT_FOUND');

	// Authorization check
	if (actor && actor.role === 'mentee' && entry.mentee_id !== actor.id) {
		throw new AppError('You can only view your own logbook entries.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === 'facility_admin' && !canAccessFacility(actor, entry.mentee.facility_id)) {
		throw new AppError('You do not have permission to access this logbook entry.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === 'mentor') {
		const assignment = await Assignment.findOne({
			where: { mentor_id: actor.id, mentee_id: entry.mentee_id, status: 'assigned' },
		});
		if (!assignment) {
			throw new AppError('You can only view logbook entries for your assigned mentees.', 403, 'FORBIDDEN');
		}
	}

	return toLogbookResponse(entry);
}

async function createLogbook(payload, actor) {
	const { mentee_id, encounter_id, thematic_area_id, procedure_type, hours, clinical_notes, outcome, goal_progress } = payload;

	// Validate mentee
	const mentee = await User.findByPk(mentee_id);
	if (!mentee) throw new AppError('Mentee not found.', 404, 'MENTEE_NOT_FOUND');
	if (mentee.role !== 'mentee') throw new AppError('Selected user is not a mentee.', 400, 'INVALID_ROLE');

	// Authorization check
	if (actor.role === 'mentee' && actor.id !== mentee_id) {
		throw new AppError('You can only create logbook entries for yourself.', 403, 'FORBIDDEN');
	}
	if (actor.role === 'facility_admin' && !canAccessUser(actor, mentee)) {
		throw new AppError('You can only create logbook entries for mentees within your facility.', 403, 'FORBIDDEN');
	}
	if (actor.role === 'mentor') {
		const assignment = await Assignment.findOne({
			where: { mentor_id: actor.id, mentee_id, status: 'assigned' },
		});
		if (!assignment) {
			throw new AppError('You can only create logbook entries for your assigned mentees.', 403, 'FORBIDDEN');
		}
	}

	// Validate encounter if provided
	if (encounter_id) {
		const encounter = await ClinicalEncounter.findByPk(encounter_id);
		if (!encounter) throw new AppError('Clinical encounter not found.', 404, 'ENCOUNTER_NOT_FOUND');
		if (encounter.mentee_id !== mentee_id) {
			throw new AppError('Encounter does not belong to this mentee.', 400, 'INVALID_ENCOUNTER');
		}
	}

	// Validate thematic area
	if (thematic_area_id) {
		const { ThematicArea } = require('../models');
		const thematicArea = await ThematicArea.findByPk(thematic_area_id);
		if (!thematicArea) throw new AppError('Thematic area not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
	}

	// Validate hours
	if (hours !== null && hours !== undefined) {
		if (typeof hours !== 'number' || hours < 0 || hours > 24) {
			throw new AppError('Hours must be a number between 0 and 24.', 400, 'INVALID_HOURS');
		}
	}

	// Validate goal_progress
	if (goal_progress !== null && goal_progress !== undefined) {
		if (typeof goal_progress !== 'number' || goal_progress < 0 || goal_progress > 100) {
			throw new AppError('Goal progress must be a number between 0 and 100.', 400, 'INVALID_PROGRESS');
		}
	}

	const entryData = {
		mentee_id,
		encounter_id: encounter_id || null,
		thematic_area_id: thematic_area_id || null,
		procedure_type: procedure_type || null,
		hours: hours || null,
		clinical_notes: clinical_notes || null,
		status: LogbookStatus.DRAFT,
		outcome: outcome || null,
		goal_progress: goal_progress || null,
		mentor_approval: false,
		created_by: actor.id,
		logged_at: new Date(),
		updated_at: new Date(),
	};

	const entry = await repository.create(entryData);
	const created = await repository.findById(entry.id);
	return toLogbookResponse(created);
}

async function updateLogbook(id, payload, actor) {
	const entry = await repository.findById(id);
	if (!entry) throw new AppError('Logbook entry not found.', 404, 'LOGBOOK_NOT_FOUND');

	// Authorization check
	if (actor.role === 'mentee' && entry.mentee_id !== actor.id) {
		throw new AppError('You can only update your own logbook entries.', 403, 'FORBIDDEN');
	}
	if (actor.role === 'facility_admin' && !canAccessFacility(actor, entry.mentee.facility_id)) {
		throw new AppError('You do not have permission to update this logbook entry.', 403, 'FORBIDDEN');
	}
	if (actor.role === 'mentor') {
		const assignment = await Assignment.findOne({
			where: { mentor_id: actor.id, mentee_id: entry.mentee_id, status: 'assigned' },
		});
		if (!assignment) {
			throw new AppError('You can only update logbook entries for your assigned mentees.', 403, 'FORBIDDEN');
		}
	}

	// Only draft or needs_revision entries can be edited
	if (entry.status !== LogbookStatus.DRAFT && entry.status !== LogbookStatus.NEEDS_REVISION) {
		throw new AppError('Only draft or needs_revision entries can be edited.', 400, 'INVALID_STATUS');
	}

	// Validate status transition if changing status
	if (payload.status && !LogbookStatus.isValidTransition(entry.status, payload.status)) {
		throw new AppError(`Cannot transition from ${entry.status} to ${payload.status}.`, 400, 'INVALID_STATUS_TRANSITION');
	}

	// Validate hours
	if (payload.hours !== null && payload.hours !== undefined) {
		if (typeof payload.hours !== 'number' || payload.hours < 0 || payload.hours > 24) {
			throw new AppError('Hours must be a number between 0 and 24.', 400, 'INVALID_HOURS');
		}
	}

	// Validate goal_progress
	if (payload.goal_progress !== null && payload.goal_progress !== undefined) {
		if (typeof payload.goal_progress !== 'number' || payload.goal_progress < 0 || payload.goal_progress > 100) {
			throw new AppError('Goal progress must be a number between 0 and 100.', 400, 'INVALID_PROGRESS');
		}
	}

	const updateData = {
		...payload,
		updated_at: new Date(),
	};

	// Clear approval fields if revising
	if (payload.status === LogbookStatus.DRAFT || payload.status === LogbookStatus.SUBMITTED) {
		updateData.mentor_approval = false;
		updateData.approved_by = null;
		updateData.approved_at = null;
	}

	await repository.update(id, updateData);
	const updated = await repository.findById(id);
	return toLogbookResponse(updated);
}

async function submitLogbook(id, actor) {
	const entry = await repository.findById(id);
	if (!entry) throw new AppError('Logbook entry not found.', 404, 'LOGBOOK_NOT_FOUND');

	// Authorization check
	if (actor.role === 'mentee' && entry.mentee_id !== actor.id) {
		throw new AppError('You can only submit your own logbook entries.', 403, 'FORBIDDEN');
	}
	if (actor.role === 'facility_admin' && !canAccessFacility(actor, entry.mentee.facility_id)) {
		throw new AppError('You do not have permission to submit this logbook entry.', 403, 'FORBIDDEN');
	}
	if (actor.role === 'mentor') {
		const assignment = await Assignment.findOne({
			where: { mentor_id: actor.id, mentee_id: entry.mentee_id, status: 'assigned' },
		});
		if (!assignment) {
			throw new AppError('You can only submit logbook entries for your assigned mentees.', 403, 'FORBIDDEN');
		}
	}

	// Validate status transition
	if (!LogbookStatus.isValidTransition(entry.status, LogbookStatus.SUBMITTED)) {
		throw new AppError(`Cannot transition from ${entry.status} to submitted.`, 400, 'INVALID_STATUS_TRANSITION');
	}

	await repository.update(id, {
		status: LogbookStatus.SUBMITTED,
		updated_at: new Date(),
	});

	const updated = await repository.findById(id);
	return toLogbookResponse(updated);
}

async function approveLogbook(id, actor) {
	const entry = await repository.findById(id);
	if (!entry) throw new AppError('Logbook entry not found.', 404, 'LOGBOOK_NOT_FOUND');

	// Authorization - only mentors and admins can approve
	if (!SYSTEM_ADMIN_ROLES.includes(actor.role) && actor.role !== 'mentor' && !FACILITY_ADMIN_ROLES.includes(actor.role)) {
		throw new AppError('Only mentors and administrators can approve logbook entries.', 403, 'FORBIDDEN');
	}

	// Mentees cannot approve their own entries
	if (actor.role === 'mentor' && entry.mentee_id === actor.id) {
		throw new AppError('You cannot approve your own logbook entry.', 403, 'FORBIDDEN');
	}

	// Facility admin scope
	if (actor.role === 'facility_admin' && !canAccessFacility(actor, entry.mentee.facility_id)) {
		throw new AppError('You can only approve logbook entries at your facility.', 403, 'FORBIDDEN');
	}

	// Mentor assignment check
	if (actor.role === 'mentor') {
		const assignment = await Assignment.findOne({
			where: { mentor_id: actor.id, mentee_id: entry.mentee_id, status: 'assigned' },
		});
		if (!assignment) {
			throw new AppError('You can only approve logbook entries for your assigned mentees.', 403, 'FORBIDDEN');
		}
	}

	// Validate status transition
	if (!LogbookStatus.isValidTransition(entry.status, LogbookStatus.APPROVED)) {
		throw new AppError(`Cannot transition from ${entry.status} to approved.`, 400, 'INVALID_STATUS_TRANSITION');
	}

	await repository.update(id, {
		status: LogbookStatus.APPROVED,
		mentor_approval: true,
		approved_by: actor.id,
		approved_at: new Date(),
		updated_at: new Date(),
	});

	const updated = await repository.findById(id);
	return toLogbookResponse(updated);
}

async function requestRevision(id, payload, actor) {
	const { revision_reason } = payload;
	const entry = await repository.findById(id);
	if (!entry) throw new AppError('Logbook entry not found.', 404, 'LOGBOOK_NOT_FOUND');

	// Authorization - only mentors and admins can request revision
	if (!SYSTEM_ADMIN_ROLES.includes(actor.role) && actor.role !== 'mentor' && !FACILITY_ADMIN_ROLES.includes(actor.role)) {
		throw new AppError('Only mentors and administrators can request revision.', 403, 'FORBIDDEN');
	}

	// Facility admin scope
	if (actor.role === 'facility_admin' && !canAccessFacility(actor, entry.mentee.facility_id)) {
		throw new AppError('You can only request revision for logbook entries at your facility.', 403, 'FORBIDDEN');
	}

	// Mentor assignment check
	if (actor.role === 'mentor') {
		const assignment = await Assignment.findOne({
			where: { mentor_id: actor.id, mentee_id: entry.mentee_id, status: 'assigned' },
		});
		if (!assignment) {
			throw new AppError('You can only request revision for logbook entries of your assigned mentees.', 403, 'FORBIDDEN');
		}
	}

	// Validate revision reason
	if (!revision_reason || typeof revision_reason !== 'string' || revision_reason.trim().length === 0) {
		throw new AppError('Revision reason is required.', 400, 'INVALID_REVISION_REASON');
	}

	// Validate status transition
	if (!LogbookStatus.isValidTransition(entry.status, LogbookStatus.NEEDS_REVISION)) {
		throw new AppError(`Cannot transition from ${entry.status} to needs_revision.`, 400, 'INVALID_STATUS_TRANSITION');
	}

	await repository.update(id, {
		status: LogbookStatus.NEEDS_REVISION,
		revision_reason: revision_reason.trim(),
		mentor_approval: false,
		approved_by: null,
		approved_at: null,
		updated_at: new Date(),
	});

	const updated = await repository.findById(id);
	return toLogbookResponse(updated);
}

async function getProgressSummary(menteeId, actor) {
	// Authorization
	if (actor && actor.role === 'mentee' && actor.id !== menteeId) {
		throw new AppError('You can only view your own progress.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === 'facility_admin') {
		const mentee = await User.findByPk(menteeId);
		if (!mentee || !canAccessUser(actor, mentee)) {
			throw new AppError('You can only view progress for mentees within your facility.', 403, 'FORBIDDEN');
		}
	}
	if (actor && actor.role === 'mentor') {
		const assignment = await Assignment.findOne({
			where: { mentor_id: actor.id, mentee_id, status: 'assigned' },
		});
		if (!assignment) {
			throw new AppError('You can only view progress for your assigned mentees.', 403, 'FORBIDDEN');
		}
	}

	const [draftCount, submittedCount, approvedCount, needsRevisionCount, rejectedCount, totalHours] = await Promise.all([
		repository.countByMenteeAndStatus(menteeId, LogbookStatus.DRAFT),
		repository.countByMenteeAndStatus(menteeId, LogbookStatus.SUBMITTED),
		repository.countByMenteeAndStatus(menteeId, LogbookStatus.APPROVED),
		repository.countByMenteeAndStatus(menteeId, LogbookStatus.NEEDS_REVISION),
		repository.countByMenteeAndStatus(menteeId, LogbookStatus.REJECTED),
		repository.getTotalHoursByMentee(menteeId),
	]);

	return {
		mentee_id: menteeId,
		status_counts: {
			draft: draftCount,
			submitted: submittedCount,
			approved: approvedCount,
			needs_revision: needsRevisionCount,
			rejected: rejectedCount,
		},
		total_approved_hours: totalHours,
		total_entries: draftCount + submittedCount + approvedCount + needsRevisionCount + rejectedCount,
	};
}

module.exports = {
	listLogbook,
	getLogbook,
	createLogbook,
	submitLogbook,
	updateLogbook,
	approveLogbook,
	requestRevision,
	getProgressSummary,
};
