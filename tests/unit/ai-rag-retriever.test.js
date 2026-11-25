process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRagRetriever } = require('../../src/providers/rag-retriever.provider');

function mockLlm() {
	return {
		embedContent: async ({ contents }) => ({
			embeddings: (Array.isArray(contents) ? contents : [contents]).map(() => new Array(768).fill(0.01)),
		}),
	};
}

test('retrieve embeds the query and returns repository chunks', async () => {
	let searchArgs;
	const repository = {
		searchSimilarChunks: async (args) => {
			searchArgs = args;
			return [{ chunk_id: 1, document_id: 2, content: 'chunk', score: 0.9 }];
		},
	};
	const retriever = createRagRetriever({ llm: mockLlm(), repository });
	const chunks = await retriever.retrieve({
		query: 'hand hygiene',
		filters: { accessScope: 'mentees', language: 'en' },
	});
	assert.equal(chunks.length, 1);
	assert.equal(chunks[0].chunk_id, 1);
	assert.equal(searchArgs.accessScope, 'mentees');
	assert.equal(searchArgs.language, 'en');
	assert.equal(searchArgs.queryEmbedding.length, 768);
});

test('retrieve returns empty array for blank queries without calling providers', async () => {
	let called = false;
	const repository = {
		searchSimilarChunks: async () => { called = true; return []; },
	};
	const retriever = createRagRetriever({ llm: mockLlm(), repository });
	const chunks = await retriever.retrieve({ query: '   ' });
	assert.deepEqual(chunks, []);
	assert.equal(called, false);
});

test('diagnostic retrieval defaults to all access scopes', async () => {
	let searchArgs;
	const repository = {
		searchSimilarChunks: async (args) => { searchArgs = args; return []; },
	};
	const retriever = createRagRetriever({ llm: mockLlm(), repository });
	await retriever.retrieveForDiagnostics({ query: 'test' });
	assert.equal(searchArgs.accessScope, 'all');
});
