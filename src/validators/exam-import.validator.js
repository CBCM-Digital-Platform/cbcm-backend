const AppError = require('../errors/app-error');

const REQUIRED_HEADERS = Object.freeze([
	'question',
	'option_a',
	'option_b',
	'option_c',
	'option_d',
	'correct_answer',
	'marks',
]);

function validationError(details) {
	return new AppError('CSV validation failed.', 400, 'CSV_VALIDATION_ERROR', details);
}

function parsePositiveInteger(value, field) {
	const number = Number(value);
	if (!Number.isSafeInteger(number) || number <= 0) {
		throw new AppError(`${field} must be a positive integer.`, 400, 'VALIDATION_ERROR');
	}
	return number;
}

function parseExamImportMetadata(body = {}) {
	const title = String(body.title || '').trim();
	const stage = String(body.stage || '').trim().toUpperCase();
	const thematicAreaId = parsePositiveInteger(body.thematic_area_id ?? body.thematicAreaId, 'thematic_area_id');
	const cycleId = parsePositiveInteger(body.cycle_id ?? body.cycleId, 'cycle_id');
	const version = parsePositiveInteger(body.version ?? 1, 'version');
	if (!title) throw new AppError('Exam title is required.', 400, 'VALIDATION_ERROR');
	if (!['PRE_TEST', 'POST_TEST'].includes(stage)) {
		throw new AppError('stage must be PRE_TEST or POST_TEST.', 400, 'VALIDATION_ERROR');
	}
	return {
		title,
		description: body.description == null ? null : String(body.description).trim() || null,
		stage,
		thematicAreaId,
		cycleId,
		version,
	};
}

function parseExamQuestionsQuery(query = {}) {
	const stage = String(query.stage || '').trim().toUpperCase();
	if (!['PRE_TEST', 'POST_TEST'].includes(stage)) {
		throw new AppError('stage must be PRE_TEST or POST_TEST.', 400, 'VALIDATION_ERROR');
	}
	const thematicAreaId = parsePositiveInteger(query.thematic_area_id ?? query.thematicAreaId, 'thematic_area_id');
	const cycleId = parsePositiveInteger(query.cycle_id ?? query.cycleId, 'cycle_id');
	return { stage, thematicAreaId, cycleId };
}

module.exports = {
	REQUIRED_HEADERS,
	parseExamImportMetadata,
	parseExamQuestionsQuery,
	validationError,
};
