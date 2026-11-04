const AppError = require('../errors/app-error');
const LearningPermission = require('../enums/learning-permission.enum');

const invalid = (message) => new AppError(message, 400, 'VALIDATION_ERROR');

const parseId = (value, field = 'id') => {
	const id = Number(value);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw invalid(`${field} must be a positive integer.`);
	}
	return id;
};

const parseBoolean = (value, fallback, field) => {
	if (value === undefined || value === null) return fallback;
	if (value === true || value === 1 || value === '1' || value === 'true') return true;
	if (value === false || value === 0 || value === '0' || value === 'false') return false;
	throw invalid(`${field} must be a boolean.`);
};

const parseModule = (body = {}) => {
	const title = typeof body.title === 'string' ? body.title.trim() : '';
	if (!title) throw invalid('title is required.');
	const estimatedDurationMinutes = body.estimatedDurationMinutes ?? body.estimated_duration_minutes ?? 0;
	const orderNumber = Number(body.orderNumber ?? body.order_number ?? 0);
	if (!Number.isSafeInteger(Number(estimatedDurationMinutes)) || Number(estimatedDurationMinutes) < 0) {
		throw invalid('estimatedDurationMinutes must be a non-negative integer.');
	}
	if (!Number.isSafeInteger(orderNumber) || orderNumber < 0) throw invalid('orderNumber must be a non-negative integer.');
	const thematicAreaId = body.thematicAreaId ?? body.thematic_area_id;
	return {
		title,
		description: typeof body.description === 'string' ? body.description.trim() : null,
		thematicAreaId: thematicAreaId == null ? null : parseId(thematicAreaId, 'thematicAreaId'),
		protocolSummary: typeof body.protocolSummary === 'string' ? body.protocolSummary.trim() : null,
		status: body.status || 'draft',
		orderNumber,
		isPublished: parseBoolean(body.isPublished ?? body.is_published, false, 'isPublished'),
		isAuthorized: parseBoolean(body.isAuthorized ?? body.is_authorized, false, 'isAuthorized'),
		estimatedDurationMinutes: Number(estimatedDurationMinutes),
	};
};

const parseContent = (body = {}) => {
	const title = typeof body.title === 'string' ? body.title.trim() : '';
	if (!title) throw invalid('title is required.');
	const orderNumber = Number(body.orderNumber ?? body.order_number ?? 0);
	const durationMinutes = Number(body.durationMinutes ?? body.duration_minutes ?? 0);
	if (!Number.isSafeInteger(orderNumber) || orderNumber < 0) throw invalid('orderNumber must be a non-negative integer.');
	if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 0) throw invalid('durationMinutes must be a non-negative integer.');
	return {
		title,
		type: body.type || 'article',
		contentText: typeof body.contentText === 'string' ? body.contentText : (typeof body.content_text === 'string' ? body.content_text : null),
		contentUrl: typeof body.contentUrl === 'string' ? body.contentUrl : (typeof body.content_url === 'string' ? body.content_url : null),
		fileId: body.fileId == null && body.file_id == null ? null : parseId(body.fileId ?? body.file_id, 'fileId'),
		orderNumber,
		isRequired: parseBoolean(body.isRequired ?? body.is_required, true, 'isRequired'),
		isPublished: parseBoolean(body.isPublished ?? body.is_published, false, 'isPublished'),
		isAuthorized: parseBoolean(body.isAuthorized ?? body.is_authorized, false, 'isAuthorized'),
		durationMinutes,
	};
};

const parseQuiz = (body = {}) => {
	const title = typeof body.title === 'string' ? body.title.trim() : '';
	if (!title) throw invalid('title is required.');
	const passScore = Number(body.passScore ?? body.pass_score ?? 0);
	const timeLimitMinutes = Number(body.timeLimitMinutes ?? body.time_limit_minutes ?? 0);
	const attemptLimit = Number(body.attemptLimit ?? body.attempt_limit ?? 1);
	if (!Number.isFinite(passScore) || passScore < 0) throw invalid('passScore must be a non-negative number.');
	if (!Number.isSafeInteger(timeLimitMinutes) || timeLimitMinutes < 0) {
		throw invalid('timeLimitMinutes must be a non-negative integer.');
	}
	if (!Number.isSafeInteger(attemptLimit) || attemptLimit < 0) {
		throw invalid('attemptLimit must be a non-negative integer.');
	}
	const quiz = {
		title,
		description: typeof body.description === 'string' ? body.description.trim() : null,
		passScore,
		timeLimitMinutes,
		attemptLimit,
		isPublished: parseBoolean(body.isPublished ?? body.is_published, false, 'isPublished'),
		isAuthorized: parseBoolean(body.isAuthorized ?? body.is_authorized, false, 'isAuthorized'),
	};
	const questions = parseNestedQuestions(body);
	if (questions) quiz.questions = questions;
	return quiz;
};

const parsePartial = (parser, body, aliases) => {
	const parsed = parser({ ...body, title: body.title ?? '__partial_payload__' });
	for (const [field, acceptedNames] of Object.entries(aliases)) {
		if (!acceptedNames.some((name) => Object.hasOwn(body, name))) delete parsed[field];
	}
	if (Object.keys(parsed).length === 0) throw invalid('At least one field is required.');
	return parsed;
};

const parseModulePatch = (body = {}) => parsePartial(parseModule, body, {
	title: ['title'],
	description: ['description'],
	thematicAreaId: ['thematicAreaId', 'thematic_area_id'],
	protocolSummary: ['protocolSummary', 'protocol_summary'],
	status: ['status'],
	orderNumber: ['orderNumber', 'order_number'],
	isPublished: ['isPublished', 'is_published'],
	isAuthorized: ['isAuthorized', 'is_authorized'],
	estimatedDurationMinutes: ['estimatedDurationMinutes', 'estimated_duration_minutes'],
});

const parseContentPatch = (body = {}) => parsePartial(parseContent, body, {
	title: ['title'],
	type: ['type'],
	contentText: ['contentText', 'content_text'],
	contentUrl: ['contentUrl', 'content_url'],
	fileId: ['fileId', 'file_id'],
	orderNumber: ['orderNumber', 'order_number'],
	isRequired: ['isRequired', 'is_required'],
	isPublished: ['isPublished', 'is_published'],
	isAuthorized: ['isAuthorized', 'is_authorized'],
	durationMinutes: ['durationMinutes', 'duration_minutes'],
});

const parseQuizPatch = (body = {}) => {
	const parsed = parsePartial(parseQuiz, body, {
		title: ['title'],
		description: ['description'],
		passScore: ['passScore', 'pass_score'],
		timeLimitMinutes: ['timeLimitMinutes', 'time_limit_minutes'],
		attemptLimit: ['attemptLimit', 'attempt_limit'],
		isPublished: ['isPublished', 'is_published'],
		isAuthorized: ['isAuthorized', 'is_authorized'],
	});
	delete parsed.questions;
	return parsed;
};

const parseMentorId = (body = {}) => {
	const mentorId = Number(body.mentorId ?? body.mentor_id ?? null);
	if (!Number.isSafeInteger(mentorId) || mentorId <= 0) {
		throw invalid('mentorId is required and must be a positive integer.');
	}
	return { mentorId };
};

const parseLearningPermission = (permission) => {
	if (!Object.values(LearningPermission).includes(permission)) {
		throw invalid('permission must be a supported learning permission.');
	}
	return permission;
};

const parseMentorPermissionGrant = (body = {}) => {
	const { mentorId } = parseMentorId(body);
	return { mentorId };
};

const parseQuizSubmission = (body = {}) => {
	const answers = Array.isArray(body.answers) ? body.answers : [];
	if (answers.length === 0) {
		throw invalid('answers must be a non-empty array.');
	}
	return {
		answers: answers.map((entry) => {
			if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
				throw invalid('Each answer must be an object.');
			}
			const selectedOptionId = entry.selectedOptionId ?? entry.selected_option_id ?? null;
			const rawSelectedOptionIds = entry.selectedOptionIds ?? entry.selected_option_ids;
			if (rawSelectedOptionIds !== undefined && !Array.isArray(rawSelectedOptionIds)) {
				throw invalid('selectedOptionIds must be an array.');
			}
			const selectedOptionIds = Array.isArray(rawSelectedOptionIds)
				? rawSelectedOptionIds.map((id) => parseId(id, 'selectedOptionIds item'))
				: [];
			if (selectedOptionId !== null) parseId(selectedOptionId, 'selectedOptionId');
			if (new Set(selectedOptionIds).size !== selectedOptionIds.length) {
				throw invalid('selectedOptionIds must not contain duplicates.');
			}
			return {
				questionId: parseId(entry.questionId ?? entry.question_id, 'questionId'),
				selectedOptionId,
				selectedOptionIds,
			};
		}),
	};
};

const CHOICE_LABELS = ['A', 'B', 'C', 'D'];

const parseChoiceLabel = (value, field = 'label') => {
	const label = String(value || '').trim().toUpperCase();
	const orderNumber = CHOICE_LABELS.indexOf(label);
	if (orderNumber < 0) throw invalid(`${field} must be one of A, B, C, or D.`);
	return { label, orderNumber };
};

const parseCorrectChoiceLabels = (body = {}) => {
	const raw = body.correctAnswer ?? body.correct_answer ?? body.correctAnswers ?? body.correct_answers
		?? body.correctOption ?? body.correct_option;
	if (raw == null || raw === '') return new Set();
	const values = Array.isArray(raw) ? raw : [raw];
	return new Set(values.map((value) => parseChoiceLabel(value, 'correctAnswer').label));
};

const parseOption = (body = {}, fallbackOrderNumber = 0) => {
	const text = typeof body.text === 'string' ? body.text.trim() : '';
	if (!text) throw invalid('text is required.');
	const hasLabel = body.label != null || body.choice != null;
	const labelInfo = hasLabel ? parseChoiceLabel(body.label ?? body.choice) : null;
	const orderNumber = Number(body.orderNumber ?? body.order_number ?? labelInfo?.orderNumber ?? fallbackOrderNumber);
	if (!Number.isSafeInteger(orderNumber) || orderNumber < 0) throw invalid('orderNumber must be a non-negative integer.');
	return {
		text,
		isCorrect: parseBoolean(body.isCorrect ?? body.is_correct, false, 'isCorrect'),
		orderNumber,
	};
};

const parseQuestionOptions = (body = {}) => {
	if (Array.isArray(body.options)) {
		return body.options.map((option, index) => parseOption(option || {}, index));
	}
	const choices = body.choices ?? body.abcd;
	if (!choices) return null;
	const correctLabels = parseCorrectChoiceLabels(body);
	if (Array.isArray(choices)) {
		return choices.map((choice, index) => {
			if (choice && typeof choice === 'object' && !Array.isArray(choice)) {
				return parseOption(choice, index);
			}
			const label = CHOICE_LABELS[index];
			if (!label) throw invalid('A question can have at most four choices (A, B, C, D).');
			return parseOption({
				text: choice,
				label,
				isCorrect: correctLabels.has(label),
			}, index);
		});
	}
	if (typeof choices === 'object') {
		return CHOICE_LABELS
			.filter((label) => choices[label] != null || choices[label.toLowerCase()] != null)
			.map((label) => parseOption({
				text: String(choices[label] ?? choices[label.toLowerCase()]),
				label,
				isCorrect: correctLabels.has(label),
			}));
	}
	throw invalid('choices must be an object or an array.');
};

const parseQuestion = (body = {}) => {
	const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
	if (!prompt) throw invalid('prompt is required.');
	const points = Number(body.points ?? 1);
	const orderNumber = Number(body.orderNumber ?? body.order_number ?? 0);
	const questionType = body.questionType ?? body.question_type ?? 'single_choice';
	if (!Number.isFinite(points) || points <= 0) throw invalid('points must be a positive number.');
	if (!Number.isSafeInteger(orderNumber) || orderNumber < 0) throw invalid('orderNumber must be a non-negative integer.');
	if (typeof questionType !== 'string' || !questionType.trim()) throw invalid('questionType must be a non-empty string.');
	const question = {
		prompt,
		questionType,
		clinicalContext: body.clinicalContext ?? body.clinical_context ?? null,
		points,
		explanation: body.explanation ?? null,
		orderNumber,
	};
	const options = parseQuestionOptions(body);
	if (options) {
		if (options.length < 2) throw invalid('A question must include at least two choices.');
		if (options.length > CHOICE_LABELS.length) throw invalid('A question can have at most four choices (A, B, C, D).');
		if (!options.some((option) => option.isCorrect)) {
			throw invalid('At least one choice must be marked correct.');
		}
		question.options = options;
	}
	return question;
};

const parseNestedQuestions = (body = {}) => {
	if (body.questions == null) return null;
	if (!Array.isArray(body.questions)) throw invalid('questions must be an array.');
	return body.questions.map((question, index) => parseQuestion({
		...(question || {}),
		orderNumber: question?.orderNumber ?? question?.order_number ?? index,
	}));
};

module.exports = {
	parseId,
	parseModule,
	parseModulePatch,
	parseContent,
	parseContentPatch,
	parseQuiz,
	parseQuizPatch,
	parseMentorId,
	parseLearningPermission,
	parseMentorPermissionGrant,
	parseQuizSubmission,
	parseQuestion,
	parseOption,
};
