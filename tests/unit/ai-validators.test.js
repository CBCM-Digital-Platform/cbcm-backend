const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
	parseId,
	parseConversationCreate,
	parseMessageCreate,
	parseFeedback,
	parseDocumentMetadata,
	parseSearchQuery,
} = require('../../src/validators/ai-assistant.validator');

test('parseId accepts positive integers and rejects invalid values', () => {
	assert.equal(parseId('5'), 5);
	assert.equal(parseId(5), 5);
	assert.throws(() => parseId('0'), { statusCode: 400 });
	assert.throws(() => parseId('-1'), { statusCode: 400 });
	assert.throws(() => parseId('abc'), { statusCode: 400 });
});

test('parseConversationCreate trims optional title', () => {
	assert.deepEqual(parseConversationCreate({ title: '  IPC questions  ' }), { title: 'IPC questions' });
	assert.deepEqual(parseConversationCreate({}), { title: undefined });
	assert.throws(() => parseConversationCreate({ title: 'x'.repeat(201) }), { statusCode: 400 });
});

test('parseMessageCreate requires non-empty content', () => {
	assert.deepEqual(parseMessageCreate({ content: 'hello' }), { content: 'hello' });
	assert.deepEqual(parseMessageCreate({ message: 'hi' }), { content: 'hi' });
	assert.throws(() => parseMessageCreate({}), { statusCode: 400 });
	assert.throws(() => parseMessageCreate({ content: '   ' }), { statusCode: 400 });
	assert.throws(() => parseMessageCreate({ content: 'x'.repeat(4001) }), { statusCode: 400 });
});

test('parseFeedback validates rating values', () => {
	assert.deepEqual(parseFeedback({ rating: 'up' }), { rating: 'up', comment: undefined });
	assert.deepEqual(parseFeedback({ rating: 'positive', comment: 'great' }), { rating: 'up', comment: 'great' });
	assert.deepEqual(parseFeedback({ rating: 'negative' }), { rating: 'down', comment: undefined });
	assert.throws(() => parseFeedback({ rating: 'maybe' }), { statusCode: 400 });
	assert.throws(() => parseFeedback({}), { statusCode: 400 });
});

test('parseDocumentMetadata extracts and validates fields', () => {
	const result = parseDocumentMetadata({
		title: 'IPC Guidelines',
		category: 'clinical_guideline',
		publicationDate: '2024-01-15',
		thematicAreaId: '3',
		accessScope: 'all',
	});
	assert.equal(result.title, 'IPC Guidelines');
	assert.equal(result.category, 'clinical_guideline');
	assert.equal(result.publication_date, '2024-01-15');
	assert.equal(result.thematic_area_id, 3);
	assert.equal(result.access_scope, 'all');
	assert.throws(() => parseDocumentMetadata({ publication_date: 'not-a-date' }), { statusCode: 400 });
});

test('parseSearchQuery requires a query and clamps limit', () => {
	const result = parseSearchQuery({ query: 'hand hygiene', limit: '500' });
	assert.equal(result.query, 'hand hygiene');
	assert.equal(result.limit, 50);
	assert.throws(() => parseSearchQuery({}), { statusCode: 400 });
});
