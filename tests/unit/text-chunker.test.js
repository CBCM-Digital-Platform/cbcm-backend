const assert = require('node:assert/strict');
const { test } = require('node:test');
const { chunkText, normalizeText } = require('../../src/utils/text-chunker.util');

test('normalizeText collapses whitespace and line endings', () => {
	assert.equal(normalizeText('a\r\n\r\nb\t c'), 'a\n\nb c');
});

test('chunkText returns empty array for empty input', () => {
	assert.deepEqual(chunkText(''), []);
	assert.deepEqual(chunkText('   \n\n  '), []);
});

test('chunkText keeps short documents as a single chunk', () => {
	const chunks = chunkText('Infection prevention requires hand hygiene.');
	assert.equal(chunks.length, 1);
	assert.equal(chunks[0].content, 'Infection prevention requires hand hygiene.');
});

test('chunkText preserves section headings on following chunks', () => {
	const text = [
		'Introduction',
		'',
		'First paragraph about mentorship.',
		'',
		' Hand Hygiene ',
		'',
		'Second paragraph about hand hygiene steps.',
	].join('\n');
	const chunks = chunkText(text, { maxChars: 200 });
	assert.ok(chunks.length >= 1);
	const headingChunk = chunks.find((c) => c.sectionHeading === 'Hand Hygiene');
	assert.ok(headingChunk, 'expected a chunk tagged with the Hand Hygiene heading');
});

test('chunkText splits long content into multiple bounded chunks', () => {
	const paragraph = 'Clinical mentorship improves healthcare worker competency. '.repeat(80);
	const chunks = chunkText(paragraph, { maxChars: 500, overlapChars: 0 });
	assert.ok(chunks.length > 1);
	for (const chunk of chunks) {
		assert.ok(chunk.content.length <= 600, `chunk too long: ${chunk.content.length}`);
	}
});

test('chunkText assigns sequential chunk indexes', () => {
	const paragraph = 'word '.repeat(600);
	const chunks = chunkText(paragraph, { maxChars: 300, overlapChars: 0 });
	assert.ok(chunks.length > 1);
	chunks.forEach((chunk, index) => assert.equal(chunk.chunkIndex, index));
});
