const moduleDto = require('../dtos/response/module.response.dto');
const quizResultDto = require('../dtos/response/quiz-result.response.dto');

const toContent = (content = {}) => ({
	id: content.id,
	moduleId: content.module_id ?? content.moduleId ?? null,
	title: content.title,
	type: content.type || 'article',
	contentText: content.content_text ?? content.contentText ?? null,
	contentUrl: content.content_url ?? content.contentUrl ?? null,
	fileId: content.file_id ?? content.fileId ?? null,
	file: content.file ? {
		id: content.file.id,
		originalName: content.file.original_name ?? content.file.originalName ?? null,
		mimeType: content.file.mime_type ?? content.file.mimeType ?? null,
		sizeBytes: Number(content.file.size_bytes ?? content.file.sizeBytes ?? 0),
	} : null,
	orderNumber: content.order_number ?? content.orderNumber ?? 0,
	isRequired: Boolean(content.is_required ?? content.isRequired ?? true),
	isPublished: Boolean(content.is_published ?? content.isPublished),
	isAuthorized: Boolean(content.is_authorized ?? content.isAuthorized),
	durationMinutes: content.duration_minutes ?? content.durationMinutes ?? 0,
	createdBy: content.created_by ?? content.createdBy ?? null,
	updatedBy: content.updated_by ?? content.updatedBy ?? null,
	createdAt: content.created_at ?? null,
	updatedAt: content.updated_at ?? null,
});

const toModule = (moduleRecord) => moduleDto.toModule(moduleRecord);

const toModuleDetail = (moduleRecord) => {
	const value = moduleRecord?.get ? moduleRecord.get({ plain: true }) : (moduleRecord || {});
	return {
		...toModule(value),
		contents: Array.isArray(value.contents) ? value.contents.map(toContent) : [],
		quizzes: Array.isArray(value.quizzes) ? value.quizzes.map((quiz) => ({
			id: quiz.id,
			moduleId: quiz.module_id ?? quiz.moduleId ?? null,
			title: quiz.title,
			description: quiz.description || null,
			passScore: quiz.pass_score ?? quiz.passScore ?? 0,
			timeLimitMinutes: quiz.time_limit_minutes ?? quiz.timeLimitMinutes ?? 0,
			attemptLimit: quiz.attempt_limit ?? quiz.attemptLimit ?? 1,
			isPublished: Boolean(quiz.is_published ?? quiz.isPublished),
			isAuthorized: Boolean(quiz.is_authorized ?? quiz.isAuthorized),
			createdBy: quiz.created_by ?? quiz.createdBy ?? null,
			createdAt: quiz.created_at ?? null,
			updatedAt: quiz.updated_at ?? null,
		})) : [],
	};
};

const toProgress = (progress = {}) => ({
	id: progress.id,
	menteeId: progress.mentee_id ?? progress.menteeId ?? null,
	moduleId: progress.module_id ?? progress.moduleId ?? null,
	assignedBy: progress.assigned_by ?? progress.assignedBy ?? null,
	assignedAt: progress.assigned_at ?? progress.assignedAt ?? null,
	status: progress.status || 'not_started',
	completionPercentage: progress.completion_percentage ?? progress.completionPercentage ?? 0,
	startedAt: progress.started_at ?? null,
	lastAccessedAt: progress.last_accessed_at ?? progress.lastAccessedAt ?? null,
	completedAt: progress.completed_at ?? progress.completedAt ?? null,
	module: progress.module ? toModule(progress.module) : null,
});

const toMentorAccess = (grant = {}) => ({
	id: grant.id,
	moduleId: grant.module_id ?? grant.moduleId ?? null,
	mentorId: grant.mentor_id ?? grant.mentorId ?? null,
	permission: grant.permission ?? null,
	grantedBy: grant.granted_by ?? grant.grantedBy ?? null,
	grantedAt: grant.granted_at ?? grant.grantedAt ?? null,
	revokedBy: grant.revoked_by ?? grant.revokedBy ?? null,
	revokedAt: grant.revoked_at ?? grant.revokedAt ?? null,
	mentor: grant.mentor ? {
		id: grant.mentor.id,
		fullName: grant.mentor.full_name,
		email: grant.mentor.email,
	} : null,
});

const toMentorPermission = (grant = {}) => ({
	...toMentorAccess(grant),
});

const toQuizAttempt = (attempt = {}) => ({
	id: attempt.id,
	quizId: attempt.quiz_id ?? attempt.quizId ?? null,
	menteeId: attempt.mentee_id ?? attempt.menteeId ?? null,
	attemptNumber: attempt.attempt_number ?? attempt.attemptNumber ?? 1,
	score: attempt.score ?? 0,
	passed: Boolean(attempt.passed),
	status: attempt.status || 'completed',
	startedAt: attempt.started_at ?? null,
	completedAt: attempt.completed_at ?? attempt.ended_at ?? null,
	createdAt: attempt.created_at ?? null,
	updatedAt: attempt.updated_at ?? null,
});

const toQuizResult = (result) => quizResultDto.toQuizResult(result);

module.exports = {
	toContent,
	toModule,
	toModuleDetail,
	toProgress,
	toMentorAccess,
	toMentorPermission,
	toQuizAttempt,
	toQuizResult,
};
