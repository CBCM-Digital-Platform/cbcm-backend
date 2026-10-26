const AppError = require('../errors/app-error');

const ALLOWED_TYPES = Object.freeze(['pdf', 'audio', 'video']);

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

	return {
		title,
		type,
		thematic_area_id,
		module_id,
		file_id,
		url,
	};
};

const validateUpdate = (body = {}) => {
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

	return {
		page,
		limit,
		thematic_area_id,
		module_id,
		type,
	};
};

module.exports = {
	ALLOWED_TYPES,
	parseId,
	parseType,
	parseTitle,
	validateCreate,
	validateUpdate,
	validateList,
};
