const AppError = require('../errors/app-error');

const invalid = (message) => new AppError(message, 400, 'VALIDATION_ERROR');

const parseId = (value, field = 'id') => {
	const id = Number(value);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw invalid(`${field} must be a positive integer.`);
	}
	return id;
};

const optionalString = (value, field, { max = 500 } = {}) => {
	if (value === undefined || value === null || value === '') return undefined;
	if (typeof value !== 'string') throw invalid(`${field} must be a string.`);
	const trimmed = value.trim();
	if (trimmed.length > max) throw invalid(`${field} must not exceed ${max} characters.`);
	return trimmed || undefined;
};

const optionalDate = (value, field) => {
	if (value === undefined || value === null || value === '') return undefined;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) throw invalid(`${field} must be a valid date.`);
	return value;
};

const parseConversationCreate = (body = {}) => {
	if (!body || typeof body !== 'object') throw invalid('Request payload is required.');
	return {
		title: optionalString(body.title, 'title', { max: 200 }),
	};
};

const parseMessageCreate = (body = {}) => {
	if (!body || typeof body !== 'object') throw invalid('Request payload is required.');
	const content = optionalString(body.content ?? body.message, 'content', { max: 4000 });
	if (!content) throw invalid('content is required.');
	return { content };
};

const parseFeedback = (body = {}) => {
	if (!body || typeof body !== 'object') throw invalid('Request payload is required.');
	const rating = String(body.rating || '').trim().toLowerCase();
	if (!['up', 'down', 'positive', 'negative'].includes(rating)) {
		throw invalid('rating must be one of: up, down.');
	}
	return {
		rating: rating === 'positive' ? 'up' : rating === 'negative' ? 'down' : rating,
		comment: optionalString(body.comment, 'comment', { max: 1000 }),
	};
};

const parseDocumentMetadata = (body = {}) => {
	if (!body || typeof body !== 'object') return {};
	const metadata = {};
	const fields = {
		title: ['title', 255],
		description: ['description', 5000],
		category: ['category', 100],
		language: ['language', 10],
		source_organization: ['source_organization', 255],
		document_version: ['document_version', 50],
	};
	for (const [key, [field, max]] of Object.entries(fields)) {
		const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
		const value = body[key] ?? body[camel];
		if (value !== undefined) metadata[key] = optionalString(value, field, { max });
	}
	for (const key of ['publication_date', 'review_date', 'expiry_date']) {
		const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
		const value = body[key] ?? body[camel];
		if (value !== undefined) metadata[key] = optionalDate(value, key);
	}
	for (const key of ['thematic_area_id', 'access_scope']) {
		const camel = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
		const value = body[key] ?? body[camel];
		if (value !== undefined) {
			metadata[key] = key.endsWith('_id') ? parseId(value, key) : optionalString(value, key, { max: 50 });
		}
	}
	return metadata;
};

const parseSearchQuery = (body = {}) => {
	if (!body || typeof body !== 'object') throw invalid('Request payload is required.');
	const query = optionalString(body.query ?? body.q, 'query', { max: 2000 });
	if (!query) throw invalid('query is required.');
	return {
		query,
		limit: body.limit === undefined ? undefined : Math.min(Math.max(parseId(body.limit, 'limit'), 1), 50),
		language: optionalString(body.language, 'language', { max: 10 }),
		thematicAreaId: body.thematic_area_id ?? body.thematicAreaId
			? parseId(body.thematic_area_id ?? body.thematicAreaId, 'thematic_area_id')
			: undefined,
		documentId: body.document_id ?? body.documentId
			? parseId(body.document_id ?? body.documentId, 'document_id')
			: undefined,
	};
};

module.exports = {
	parseId,
	parseConversationCreate,
	parseMessageCreate,
	parseFeedback,
	parseDocumentMetadata,
	parseSearchQuery,
};
