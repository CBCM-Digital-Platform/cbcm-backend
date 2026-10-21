const toQuizResult = (record) => {
	const value = record?.get ? record.get({ plain: true }) : record || {};
	return {
		id: value.id,
		quizId: value.quiz_id ?? value.quizId ?? null,
		menteeId: value.mentee_id ?? value.menteeId ?? null,
		score: value.score ?? 0,
		passed: Boolean(value.passed),
		status: value.status || 'completed',
		attemptNumber: value.attempt_number ?? value.attemptNumber ?? 1,
		startedAt: value.started_at || null,
		completedAt: value.completed_at || value.ended_at || null,
	};
};

module.exports = { toQuizResult };
