// src/enums/session-status.enum.js
const SessionStatus = {
	DRAFT: 'draft',
	SCHEDULED: 'scheduled',
	IN_PROGRESS: 'in_progress',
	COMPLETED: 'completed',
	CANCELLED: 'cancelled',
	TERMINATED: 'terminated',
	NO_SHOW: 'no_show',
};

// Valid status transitions
const TRANSITIONS = Object.freeze({
	[SessionStatus.DRAFT]: ['draft', 'scheduled', 'cancelled'],
	[SessionStatus.SCHEDULED]: ['scheduled', 'in_progress', 'cancelled', 'no_show'],
	[SessionStatus.IN_PROGRESS]: ['in_progress', 'completed', 'terminated'],
	[SessionStatus.COMPLETED]: ['completed'],
	[SessionStatus.CANCELLED]: ['cancelled'],
	[SessionStatus.TERMINATED]: ['terminated'],
	[SessionStatus.NO_SHOW]: ['no_show'],
	DRAFT: ['draft', 'scheduled', 'cancelled'],
	SCHEDULED: ['scheduled', 'in_progress', 'cancelled', 'no_show'],
	IN_PROGRESS: ['in_progress', 'completed', 'terminated'],
	COMPLETED: ['completed'],
	CANCELLED: ['cancelled'],
	TERMINATED: ['terminated'],
	NO_SHOW: ['no_show'],
});

function isValidTransition(fromStatus, toStatus) {
	const allowed = TRANSITIONS[fromStatus];
	return Boolean(allowed && allowed.includes(toStatus));
}

Object.defineProperty(SessionStatus, 'TRANSITIONS', {
	value: TRANSITIONS,
	enumerable: false,
	writable: false,
	configurable: false,
});

Object.defineProperty(SessionStatus, 'isValidTransition', {
	value: isValidTransition,
	enumerable: false,
	writable: false,
	configurable: false,
});

module.exports = Object.freeze(SessionStatus);
