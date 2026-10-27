// src/enums/logbook-status.enum.js
function isValidTransition(currentStatus, newStatus) {
	const transitions = {
		draft: ['draft', 'submitted', 'cancelled'],
		submitted: ['submitted', 'approved', 'needs_revision', 'rejected'],
		approved: ['approved'],
		needs_revision: ['needs_revision', 'draft', 'submitted'],
		rejected: ['rejected', 'draft'],
		cancelled: ['cancelled'],
	};
	return transitions[currentStatus]?.includes(newStatus) || false;
}

const LogbookStatus = Object.freeze({
	DRAFT: 'draft',
	SUBMITTED: 'submitted',
	APPROVED: 'approved',
	NEEDS_REVISION: 'needs_revision',
	REJECTED: 'rejected',
	CANCELLED: 'cancelled',
	isValidTransition,
});

module.exports = LogbookStatus;
