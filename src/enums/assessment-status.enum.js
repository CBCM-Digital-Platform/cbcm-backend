// src/enums/assessment-status.enum.js
function isValidTransition(currentStatus, newStatus) {
	const transitions = {
		draft: ['draft', 'in_review'],
		in_review: ['in_review', 'finalized', 'draft'],
		finalized: ['finalized', 'reviewed'],
		reviewed: ['reviewed'],
	};
	return transitions[currentStatus]?.includes(newStatus) || false;
}

const AssessmentStatus = Object.freeze({
	DRAFT: 'draft',
	IN_REVIEW: 'in_review',
	FINALIZED: 'finalized',
	REVIEWED: 'reviewed',
	isValidTransition,
});

module.exports = AssessmentStatus;
