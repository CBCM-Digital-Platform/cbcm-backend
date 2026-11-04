// src/services/sessions.service.js
const crypto = require('crypto');
const { Op } = require('sequelize');
const AppError = require('../errors/app-error');
const SessionStatus = require('../enums/session-status.enum');
const EncounterMode = require('../enums/encounter-mode.enum');
const CycleStatus = require('../enums/cycle-status.enum');
const repository = require('../repositories/sessions.repository');
const assignmentsRepository = require('../repositories/assignments.repository');
const { canAccessFacility, SYSTEM_ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../constants/roles.constants');
const notificationService = require('./notifications.service');
const NotificationType = require('../enums/notification-type.enum');
const Role = require('../enums/role.enum');
const env = require('../config/env');

function paginationValues(page = 1, limit = 20) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

function toSessionResponse(session) {
	if (!session) return null;
	const value = session.toJSON ? session.toJSON() : session;
	return Object.fromEntries([
		'id', 'assignment_id', 'mentor_id', 'mentee_id', 'facility_id',
		'mode', 'scheduled_at', 'started_at', 'ended_at', 'duration_minutes',
		'clinical_setting', 'location', 'session_goals', 'preparation_notes',
		'status', 'cancellation_reason', 'jitsi_room_enabled',
		'created_at', 'updated_at',
	].filter((field) => value[field] !== undefined).map((field) => [field, value[field]]));
}

async function listSessions(filters, actor) {
	const where = {};
	const pagination = paginationValues(filters.page, filters.limit);

	// Role-based filtering
	if (actor.role === Role.MENTOR) {
		where.mentor_id = actor.id;
	} else if (actor.role === Role.MENTEE) {
		where.mentee_id = actor.id;
	} else if (actor.role === Role.FACILITY_ADMIN) {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		where.facility_id = actor.facility_id;
	}

	// Apply filters
	if (filters.status) where.status = filters.status;
	if (filters.mode) where.mode = filters.mode;
	if (filters.mentor_id) where.mentor_id = filters.mentor_id;
	if (filters.mentee_id) where.mentee_id = filters.mentee_id;
	if (filters.facility_id) where.facility_id = filters.facility_id;
	if (filters.start_date || filters.end_date) {
		where.scheduled_at = {};
		if (filters.start_date) where.scheduled_at[Op.gte] = filters.start_date;
		if (filters.end_date) where.scheduled_at[Op.lte] = filters.end_date;
	}

	const count = await repository.count(where);
	const rows = await repository.findMany(where, {
		order: [['id', 'DESC']],
		limit: pagination.limit,
		offset: pagination.offset,
	});

	// Handle empty results
	const items = Array.isArray(rows) ? rows : [];

	return {
		items: items.map(toSessionResponse),
		total: count,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil(count / pagination.limit)),
	};
}

async function getSession(id, actor) {
	const session = await repository.findWithIncludes(id);
	if (!session) throw new AppError('Session was not found.', 404, 'SESSION_NOT_FOUND');

	// Authorization check
	if (actor.role === Role.MENTOR && session.mentor_id !== actor.id) {
		throw new AppError('You can only view your own sessions.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE && session.mentee_id !== actor.id) {
		throw new AppError('You can only view your own sessions.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, session.facility_id)) {
		throw new AppError('You can only view sessions at your facility.', 403, 'FORBIDDEN');
	}

	return toSessionResponse(session);
}

async function createSession(payload, actor) {
	const { assignment_id, mode, scheduled_at, duration_minutes, status } = payload;

	// Fetch assignment with cycle
	const assignment = await assignmentsRepository.findWithIncludes(assignment_id);
	if (!assignment) throw new AppError('Assignment was not found.', 404, 'ASSIGNMENT_NOT_FOUND');

	// Validate assignment status
	if (assignment.status !== 'assigned') {
		throw new AppError('Assignment is not active.', 400, 'INVALID_ASSIGNMENT_STATUS');
	}

	// Validate cycle status
	if (!assignment.cycle || assignment.cycle.status !== CycleStatus.ACTIVE) {
		throw new AppError('Session can only be scheduled during active mentorship cycles.', 400, 'INVALID_CYCLE_STATUS');
	}

	// Authorization
	if (actor.role === Role.MENTOR && assignment.mentor_id !== actor.id) {
		throw new AppError('You can only create sessions for your own assignments.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE && assignment.mentee_id !== actor.id) {
		throw new AppError('You can only create sessions for your own assignments.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assignment.facility_id)) {
		throw new AppError('You can only create sessions at your facility.', 403, 'FORBIDDEN');
	}

	// Validate duration
	if (duration_minutes !== undefined) {
		if (duration_minutes < 5 || duration_minutes > 180) {
			throw new AppError('Duration must be between 5 and 180 minutes.', 400, 'INVALID_DURATION');
		}
	}

	// Check for scheduling conflicts
	if (scheduled_at && duration_minutes) {
		const conflicts = await repository.checkForConflicts(
			assignment.mentor_id,
			assignment.mentee_id,
			scheduled_at,
			duration_minutes
		);
		if (conflicts.length > 0) {
			throw new AppError('Scheduling conflict detected.', 409, 'SCHEDULING_CONFLICT');
		}
	}

	// Prepare session data
	const sessionData = {
		assignment_id,
		mentor_id: assignment.mentor_id,
		mentee_id: assignment.mentee_id,
		facility_id: assignment.facility_id,
		mode,
		scheduled_at: scheduled_at || null,
		duration_minutes: duration_minutes || null,
		clinical_setting: payload.clinical_setting || null,
		location: payload.location || null,
		session_goals: payload.session_goals || null,
		preparation_notes: payload.preparation_notes || null,
		status: status || SessionStatus.DRAFT,
		jitsi_room_id: (mode === EncounterMode.VIRTUAL && (status === 'scheduled' || scheduled_at)) ? crypto.randomBytes(16).toString('hex') : null,
		jitsi_room_enabled: Boolean(mode === EncounterMode.VIRTUAL && (status === 'scheduled' || !!scheduled_at)),
	};

	const session = await repository.create(sessionData);

	// Notify both participants when a session is scheduled
	if (session.status === 'scheduled' || session.scheduled_at) {
		await notificationService.publishEventSafely({
			eventType: 'session.scheduled',
			eventKey: `session:${session.id}:scheduled`,
			referenceType: 'clinical_session',
			referenceId: session.id,
			userIds: [session.mentor_id, session.mentee_id],
			facilityIds: [session.facility_id],
		});
	}

	return toSessionResponse(session);
}

async function updateSession(id, payload, actor) {
	const session = await repository.findById(id);
	if (!session) throw new AppError('Session was not found.', 404, 'SESSION_NOT_FOUND');

	// Fetch assignment for authorization
	const assignment = await assignmentsRepository.findWithIncludes(session.assignment_id);
	if (!assignment) throw new AppError('Assignment was not found.', 404, 'ASSIGNMENT_NOT_FOUND');

	// Authorization
	if (actor.role === Role.MENTOR && assignment.mentor_id !== actor.id) {
		throw new AppError('You can only update your own sessions.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE && assignment.mentee_id !== actor.id) {
		throw new AppError('You can only update your own sessions.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, session.facility_id)) {
		throw new AppError('You can only update sessions at your facility.', 403, 'FORBIDDEN');
	}

	// Validate status transition if changing status
	if (payload.status && payload.status !== session.status) {
		if (!SessionStatus.isValidTransition(session.status, payload.status)) {
			throw new AppError(`Cannot transition session from ${session.status} to ${payload.status}.`, 400, 'INVALID_STATUS_TRANSITION');
		}
		// Validate cycle status for scheduled sessions
		if (payload.status === 'scheduled' && (!assignment.cycle || assignment.cycle.status !== CycleStatus.ACTIVE)) {
			throw new AppError('Session can only be scheduled during active mentorship cycles.', 400, 'INVALID_CYCLE_STATUS');
		}
	}

	// Validate duration
	if (payload.duration_minutes !== undefined) {
		if (payload.duration_minutes < 5 || payload.duration_minutes > 180) {
			throw new AppError('Duration must be between 5 and 180 minutes.', 400, 'INVALID_DURATION');
		}
	}

	// Check for scheduling conflicts if scheduling details changed
	if ((payload.scheduled_at || payload.duration_minutes) && session.status === 'scheduled') {
		const newScheduledAt = payload.scheduled_at || session.scheduled_at;
		const newDuration = payload.duration_minutes || session.duration_minutes;
		if (newScheduledAt && newDuration) {
			const conflicts = await repository.checkForConflicts(
				assignment.mentor_id,
				assignment.mentee_id,
				newScheduledAt,
				newDuration,
				id
			);
			if (conflicts.length > 0) {
				throw new AppError('Scheduling conflict detected.', 409, 'SCHEDULING_CONFLICT');
			}
		}
	}

	// Update fields
	const updateData = {};
	if (payload.mode !== undefined) updateData.mode = payload.mode;
	if (payload.scheduled_at !== undefined) updateData.scheduled_at = payload.scheduled_at;
	if (payload.duration_minutes !== undefined) updateData.duration_minutes = payload.duration_minutes;
	if (payload.clinical_setting !== undefined) updateData.clinical_setting = payload.clinical_setting;
	if (payload.location !== undefined) updateData.location = payload.location;
	if (payload.session_goals !== undefined) updateData.session_goals = payload.session_goals;
	if (payload.preparation_notes !== undefined) updateData.preparation_notes = payload.preparation_notes;
	if (payload.status !== undefined) updateData.status = payload.status;

	const updated = await repository.update(id, updateData);
	if (payload.status || payload.scheduled_at !== undefined) {
		await notificationService.publishEventSafely({
			eventType: 'session.status_changed',
			eventKey: `session:${id}:updated:${updated.updated_at || Date.now()}`,
			referenceType: 'clinical_session',
			referenceId: id,
			userIds: [updated.mentor_id, updated.mentee_id],
			facilityIds: [updated.facility_id],
		});
	}
	return toSessionResponse(updated);
}

async function updateSessionStatus(id, status, actor) {
	const session = await repository.findById(id);
	if (!session) throw new AppError('Session was not found.', 404, 'SESSION_NOT_FOUND');

	// Authorization based on session fields directly
	if (actor.role === Role.MENTOR && session.mentor_id !== actor.id) {
		throw new AppError('You can only update your own sessions.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE && session.mentee_id !== actor.id) {
		throw new AppError('You can only update your own sessions.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, session.facility_id)) {
		throw new AppError('You can only update sessions at your facility.', 403, 'FORBIDDEN');
	}

	// Validate transition
	if (!SessionStatus.isValidTransition(session.status, status)) {
		throw new AppError(`Cannot transition session from ${session.status} to ${status}.`, 400, 'INVALID_STATUS_TRANSITION');
	}

	// Validate cycle status for scheduled sessions
	if (status === 'scheduled' && session.assignment_id) {
		const assignment = await assignmentsRepository.findWithIncludes(session.assignment_id);
		if (!assignment || !assignment.cycle || assignment.cycle.status !== CycleStatus.ACTIVE) {
			throw new AppError('Session can only be scheduled during active mentorship cycles.', 400, 'INVALID_CYCLE_STATUS');
		}
	}

	// Update status and timestamps
	const updateData = { status };
	if (status === SessionStatus.IN_PROGRESS && !session.started_at) {
		updateData.started_at = new Date();
	}
	if ((status === SessionStatus.COMPLETED || status === SessionStatus.TERMINATED || status === SessionStatus.CANCELLED) && !session.ended_at) {
		updateData.ended_at = new Date();
	}

	const updated = await repository.update(id, updateData);
	return toSessionResponse(updated);
}

async function createMentorNote(id, note, actor) {
	const session = await repository.findById(id);
	if (!session) throw new AppError('Session was not found.', 404, 'SESSION_NOT_FOUND');

	// Only mentors can create notes
	if (actor.role !== Role.MENTOR) {
		throw new AppError('Only mentors can create clinical notes.', 403, 'FORBIDDEN');
	}

	// Verify mentor is assigned to this session
	if (session.mentor_id !== actor.id) {
		throw new AppError('You can only create notes for your own sessions.', 403, 'FORBIDDEN');
	}

	const mentorNote = await repository.createMentorNote(id, actor.id, note);
	return mentorNote;
}

async function getMentorNotes(id, actor) {
	const session = await repository.findById(id);
	if (!session) throw new AppError('Session was not found.', 404, 'SESSION_NOT_FOUND');

	// Authorization
	if (actor.role === Role.MENTOR && session.mentor_id !== actor.id) {
		throw new AppError('You can only view notes for your own sessions.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE && session.mentee_id !== actor.id) {
		throw new AppError('You can only view notes for your own sessions.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, session.facility_id)) {
		throw new AppError('You can only view notes at your facility.', 403, 'FORBIDDEN');
	}

	return await repository.getMentorNotes(id);
}

async function generateJoinToken(id, actor) {
	const session = await repository.findById(id);
	if (!session) throw new AppError('Session was not found.', 404, 'SESSION_NOT_FOUND');

	// Validate mode
	if (session.mode !== EncounterMode.VIRTUAL) {
		throw new AppError('Jitsi tokens are only available for virtual sessions.', 400, 'INVALID_SESSION_MODE');
	}

	// Validate status
	if (session.status !== SessionStatus.SCHEDULED && session.status !== SessionStatus.IN_PROGRESS) {
		throw new AppError('Jitsi tokens are only available for scheduled or in-progress sessions.', 400, 'INVALID_SESSION_STATUS');
	}

	// Validate participant
	if (actor.role === Role.MENTOR && session.mentor_id !== actor.id) {
		throw new AppError('You are not a participant in this session.', 403, 'FORBIDDEN');
	}
	if (actor.role === Role.MENTEE && session.mentee_id !== actor.id) {
		throw new AppError('You are not a participant in this session.', 403, 'FORBIDDEN');
	}

	// Public development mode (no JWT)
	if (env.JITSI_PUBLIC_MODE && env.JITSI_DOMAIN) {
		return {
			domain: env.JITSI_DOMAIN || 'meet.jit.si',
			room: session.jitsi_room_id,
			token: null,
			url: `https://${env.JITSI_DOMAIN || 'meet.jit.si'}/${session.jitsi_room_id}`,
			expires_at: null,
		};
	}

	// Validate Jitsi configuration
	if (!env.JITSI_DOMAIN || !env.JITSI_APP_ID || !env.JITSI_SECRET) {
		throw new AppError('Jitsi is not configured.', 500, 'JITSI_NOT_CONFIGURED');
	}

	// Generate JWT token for Jitsi
	const jwt = require('jsonwebtoken');
	const now = Date.now();
	const expiry = now + (parseInt(env.JITSI_TOKEN_EXPIRY) || 3600) * 1000;

	const payload = {
		context: {
			user: {
				name: actor.full_name,
				id: String(actor.id),
				avatar: actor.avatar_url || '',
			},
		},
		room: session.jitsi_room_id,
		exp: expiry / 1000,
	};

	const token = jwt.sign(payload, env.JITSI_SECRET, {
		algorithm: 'HS256',
		audience: env.JITSI_APP_ID,
		issuer: env.JITSI_APP_ID,
	});

	return {
		domain: env.JITSI_DOMAIN,
		room: session.jitsi_room_id,
		token,
		expires_at: new Date(expiry).toISOString(),
	};
}

async function handleParticipantJoin(id, userId) {
	const session = await repository.findById(id);
	if (!session) throw new AppError('Session was not found.', 404, 'SESSION_NOT_FOUND');

	// Validate participant
	if (session.mentor_id !== userId && session.mentee_id !== userId) {
		throw new AppError('You are not a participant in this session.', 403, 'FORBIDDEN');
	}

	// Auto-transition to in_progress if currently scheduled
	if (session.status === SessionStatus.SCHEDULED) {
		const updateData = {
			status: SessionStatus.IN_PROGRESS,
			started_at: new Date(),
		};
		await repository.update(id, updateData);
	}

	return { success: true };
}

module.exports = {
	getAvailableTimes,
	listSessions,
	getSession,
	createSession,
	updateSession,
	updateSessionStatus,
	createMentorNote,
	getMentorNotes,
	generateJoinToken,
	handleParticipantJoin,
};

async function getAvailableTimes(params, actor) {
	const assignment = await assignmentsRepository.findWithIncludes(params.assignment_id);
	if (!assignment) throw new AppError('Assignment was not found.', 404, 'ASSIGNMENT_NOT_FOUND');
	if (actor.role === Role.MENTOR && assignment.mentor_id !== actor.id) throw new AppError('Forbidden', 403, 'FORBIDDEN');
	if (actor.role === Role.MENTEE && assignment.mentee_id !== actor.id) throw new AppError('Forbidden', 403, 'FORBIDDEN');
	if (actor.role === Role.FACILITY_ADMIN && !canAccessFacility(actor, assignment.facility_id)) throw new AppError('Forbidden', 403, 'FORBIDDEN');
	if (!assignment.cycle || assignment.cycle.status !== 'active') throw new AppError('Cycle not active', 400, 'INVALID_CYCLE_STATUS');

	const duration = params.duration_minutes || 60;
	const dayStart = new Date(`${params.date}T08:00:00+03:00`);
	const dayEnd = new Date(`${params.date}T17:00:00+03:00`);
	const existing = await repository.findMany({ mentor_id: assignment.mentor_id }, { where: { scheduled_at: { [Op.gte]: dayStart, [Op.lt]: dayEnd } } });
	const slots = [];
	for (let t = dayStart.getTime(); t + duration*60000 <= dayEnd.getTime(); t += 30*60000) {
		const start = new Date(t);
		const end = new Date(t + duration*60000);
		const blocked = existing.some((s) => {
			if (s.status === 'cancelled') return false;
			const sStart = new Date(s.scheduled_at);
			const sEnd = new Date(sStart.getTime() + (s.duration_minutes || 60)*60000);
			return start < sEnd && end > sStart;
		});
		slots.push({ start_time: start.toISOString(), end_time: end.toISOString(), available: !blocked });
	}
	return { date: params.date, duration_minutes: duration, timezone: 'Africa/Addis_Ababa', available_times: slots };
}

