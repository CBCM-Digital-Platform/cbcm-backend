const AppError = require('../errors/app-error');
const LearningMaterialCategory = require('../enums/learning-material-category.enum');
const LearningExaminationStage = require('../enums/learning-examination-stage.enum');

const ALLOWED_TYPES = Object.freeze(['pdf', 'audio', 'video', 'presentation']);
const ALLOWED_CATEGORIES = Object.freeze(Object.values(LearningMaterialCategory));
const ALLOWED_EXAMINATION_STAGES = Object.freeze(Object.values(LearningExaminationStage));
const NON_MENTEE_CATEGORIES = Object.freeze([
	LearningMaterialCategory.FACILITATOR_GUIDE,
	LearningMaterialCategory.ANSWER_KEY,
]);

const invalid = (message) => new AppError(message, 400, 'VALIDATION_ERROR');

const parseId = (value, field = 'id') => {
	const id = Number(value);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw invalid(`${field} must be a positive integer.`);
	}
	return id;
};

const parseType = (value, field = 'type') => {
	if (!value || typeof value !== 'string') {
		throw invalid(`${field} is required.`);
	}
	const normalized = value.trim().toLowerCase();
	if (!ALLOWED_TYPES.includes(normalized)) {
		throw invalid(`${field} must be one of: ${ALLOWED_TYPES.join(', ')}.`);
	}
	return normalized;
};

const parseCategory = (value, field = 'category') => {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string' || !ALLOWED_CATEGORIES.includes(value)) {
		throw invalid(`${field} must be one of: ${ALLOWED_CATEGORIES.join(', ')}.`);
	}
	return value;
};

const parseRequiredCategory = (value, field = 'category') => {
	if (value === undefined || value === null) {
		throw invalid(`${field} is required.`);
	}
	return parseCategory(value, field);
};

const parseExaminationStage = (value, field = 'examination_stage') => {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string' || !ALLOWED_EXAMINATION_STAGES.includes(value)) {
		throw invalid(`${field} must be one of: ${ALLOWED_EXAMINATION_STAGES.join(', ')}.`);
	}
	return value;
};

const parseRequired = (value, field = 'is_required') => {
	if (value === undefined) return undefined;
	if (typeof value !== 'boolean') {
		throw invalid(`${field} must be a boolean.`);
	}
	return value;
};

const validateMaterialClassification = ({ category, examinationStage, type, isRequired }) => {
	if (category === LearningMaterialCategory.EXAMINATION && !examinationStage) {
		throw invalid('examination_stage is required when category is EXAMINATION.');
	}
	if (category !== LearningMaterialCategory.EXAMINATION && examinationStage) {
		throw invalid('examination_stage is only allowed when category is EXAMINATION.');
	}
	if (category === LearningMaterialCategory.POWERPOINT_PRESENTATION && type !== 'presentation') {
		throw invalid('type must be presentation when category is POWERPOINT_PRESENTATION.');
	}
	if (NON_MENTEE_CATEGORIES.includes(category) && isRequired) {
		throw invalid(`${category} cannot be required for mentees.`);
	}
};

const parseTitle = (value, field = 'title') => {
	if (typeof value !== 'string') {
		throw invalid(`${field} must be a string.`);
	}
	const trimmed = value.trim();
	if (!trimmed) {
		throw invalid(`${field} is required and cannot be empty.`);
	}
	if (trimmed.length > 255) {
		throw invalid(`${field} must not exceed 255 characters.`);
	}
	return trimmed;
};

const validateCreate = (body = {}) => {
	if (!body || typeof body !== 'object') {
		throw invalid('Request payload is required.');
	}

	const title = parseTitle(body.title, 'title');
	const type = parseType(body.type, 'type');

	const rawThematicAreaId = body.thematic_area_id ?? body.thematicAreaId;
	if (rawThematicAreaId === undefined || rawThematicAreaId === null || rawThematicAreaId === '') {
		throw invalid('thematic_area_id is required.');
	}
	const thematic_area_id = parseId(rawThematicAreaId, 'thematic_area_id');

	const rawModuleId = body.module_id ?? body.moduleId;
	if (rawModuleId === undefined || rawModuleId === null || rawModuleId === '') {
		throw invalid('module_id is required.');
	}
	const module_id = parseId(rawModuleId, 'module_id');

	const rawFileId = body.file_id ?? body.fileId;
	if (rawFileId === undefined || rawFileId === null || rawFileId === '') {
		throw invalid('file_id is required.');
	}
	const file_id = parseId(rawFileId, 'file_id');

	const url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : null;
	const category = parseRequiredCategory(body.category);
	const examination_stage = parseExaminationStage(body.examination_stage ?? body.examinationStage);
	const rawRequired = body.is_required !== undefined ? body.is_required : body.isRequired;
	const is_required = rawRequired === undefined
		? !NON_MENTEE_CATEGORIES.includes(category)
		: parseRequired(rawRequired);
	validateMaterialClassification({ category, examinationStage: examination_stage, type, isRequired: is_required });

	return {
		title,
		type,
		thematic_area_id,
		module_id,
		file_id,
		url,
		category,
		examination_stage,
		is_required,
	};
};

const validateUpdate = (body = {}, current = {}) => {
	if (!body || typeof body !== 'object') {
		throw invalid('Request payload is required.');
	}

	const fields = Object.keys(body);
	if (fields.length === 0) {
		throw invalid('At least one field must be provided for update.');
	}

	const allowedFields = [
		'title',
		'type',
		'thematic_area_id',
		'thematicAreaId',
		'module_id',
		'moduleId',
		'file_id',
		'fileId',
		'url',
		'category',
		'examination_stage',
		'examinationStage',
		'is_required',
		'isRequired',
	];
	const unsupported = fields.filter((f) => !allowedFields.includes(f));
	if (unsupported.length > 0) {
		throw invalid(`Unsupported fields: ${unsupported.join(', ')}.`);
	}

	const result = {};

	if (body.title !== undefined) {
		result.title = parseTitle(body.title, 'title');
	}

	if (body.type !== undefined) {
		result.type = parseType(body.type, 'type');
	}

	const rawThematicAreaId = body.thematic_area_id ?? body.thematicAreaId;
	if (rawThematicAreaId !== undefined) {
		result.thematic_area_id = rawThematicAreaId === null ? null : parseId(rawThematicAreaId, 'thematic_area_id');
	}

	const rawModuleId = body.module_id ?? body.moduleId;
	if (rawModuleId !== undefined) {
		result.module_id = rawModuleId === null ? null : parseId(rawModuleId, 'module_id');
	}

	const rawFileId = body.file_id ?? body.fileId;
	if (rawFileId !== undefined) {
		result.file_id = rawFileId === null ? null : parseId(rawFileId, 'file_id');
	}

	if (body.url !== undefined) {
		result.url = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : null;
	}

	const rawCategory = body.category;
	if (rawCategory !== undefined) {
		result.category = parseCategory(rawCategory);
	}

	const rawStage = body.examination_stage ?? body.examinationStage;
	if (rawStage !== undefined || body.examination_stage === null || body.examinationStage === null) {
		result.examination_stage = parseExaminationStage(rawStage);
	}

	const hasRequiredField = body.is_required !== undefined || body.isRequired !== undefined;
	const rawRequired = body.is_required !== undefined ? body.is_required : body.isRequired;
	if (hasRequiredField) {
		result.is_required = parseRequired(rawRequired);
	}

	const effectiveCategory = result.category !== undefined ? result.category : current.category ?? null;
	const effectiveStage = result.examination_stage !== undefined
		? result.examination_stage
		: current.examination_stage ?? null;
	const effectiveType = result.type !== undefined ? result.type : current.type;
	let effectiveRequired = result.is_required !== undefined ? result.is_required : current.is_required;

	if (result.category !== undefined && result.category !== LearningMaterialCategory.EXAMINATION
		&& result.examination_stage === undefined) {
		result.examination_stage = null;
	}
	if (result.category !== undefined && NON_MENTEE_CATEGORIES.includes(result.category)
		&& result.is_required === undefined) {
		result.is_required = false;
		effectiveRequired = false;
	}

	validateMaterialClassification({
		category: effectiveCategory,
		examinationStage: result.examination_stage !== undefined ? result.examination_stage : effectiveStage,
		type: effectiveType,
		isRequired: effectiveRequired,
	});

	if (Object.keys(result).length === 0) {
		throw invalid('No valid fields provided for update.');
	}

	return result;
};

const validateList = (query = {}) => {
	const page = query.page !== undefined ? parseId(query.page, 'page') : 1;
	let limit = 20;
	if (query.limit !== undefined) {
		limit = parseId(query.limit, 'limit');
		if (limit > 100) limit = 100;
	}

	const rawThematicAreaId = query.thematic_area_id ?? query.thematicAreaId;
	const thematic_area_id = rawThematicAreaId !== undefined && rawThematicAreaId !== '' ? parseId(rawThematicAreaId, 'thematic_area_id') : undefined;

	const rawModuleId = query.module_id ?? query.moduleId;
	const module_id = rawModuleId !== undefined && rawModuleId !== '' ? parseId(rawModuleId, 'module_id') : undefined;

	let type;
	if (query.type !== undefined && query.type !== '') {
		type = parseType(query.type, 'type');
	}
	let category;
	if (query.category !== undefined && query.category !== '') {
		category = parseCategory(query.category);
		if (!category) throw invalid('category must be a valid learning material category.');
	}
	let examination_stage;
	if (query.examination_stage !== undefined && query.examination_stage !== '') {
		examination_stage = parseExaminationStage(query.examination_stage);
		if (!examination_stage) throw invalid('examination_stage must be a valid examination stage.');
		if (category !== LearningMaterialCategory.EXAMINATION) {
			throw invalid('examination_stage can only be filtered when category is EXAMINATION.');
		}
	}

	return {
		page,
		limit,
		thematic_area_id,
		module_id,
		type,
		category,
		examination_stage,
	};
};

const parseResourceAssignment = (body = {}) => {
	if (!body || typeof body !== 'object') {
		throw invalid('Request payload is required.');
	}
	return {
		mentee_id: parseId(body.mentee_id ?? body.menteeId, 'mentee_id'),
	};
};

const parseResourceAssignments = (body = {}) => {
	if (!body || typeof body !== 'object' || !Array.isArray(body.mentee_ids ?? body.menteeIds)) {
		throw invalid('mentee_ids must be an array.');
	}
	const menteeIds = body.mentee_ids ?? body.menteeIds;
	if (menteeIds.length === 0) {
		throw invalid('At least one mentee_id is required.');
	}
	return {
		mentee_ids: [...new Set(menteeIds.map((id) => parseId(id, 'mentee_id')))],
	};
};

module.exports = {
	ALLOWED_TYPES,
	ALLOWED_CATEGORIES,
	ALLOWED_EXAMINATION_STAGES,
	parseId,
	parseType,
	parseCategory,
	parseRequiredCategory,
	parseExaminationStage,
	parseRequired,
	parseTitle,
	validateCreate,
	validateUpdate,
	validateList,
	parseResourceAssignment,
	parseResourceAssignments,
};
