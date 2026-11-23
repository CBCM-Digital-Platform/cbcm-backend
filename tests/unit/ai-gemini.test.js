process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createLlmProvider } = require('../../src/providers/llm.provider');

function mockClient({ generateContent, embedContent } = {}) {
	return {
		models: {
			generateContent: generateContent || (async () => ({
				text: 'mocked response',
				usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
				candidates: [{ finishReason: 'STOP' }],
			})),
			embedContent: embedContent || (async ({ contents }) => ({
				embeddings: (Array.isArray(contents) ? contents : [contents]).map(() => ({
					values: new Array(768).fill(0.1),
				})),
			})),
		},
	};
}

test('generateContent returns normalized text and usage metadata', async () => {
	let captured;
	const provider = createLlmProvider({
		apiKey: 'test-key',
		model: 'gemini-test',
		temperature: 0.2,
		maxOutputTokens: 512,
		client: mockClient({
			generateContent: async (params) => {
				captured = params;
				return { text: 'answer', usageMetadata: { totalTokenCount: 42 } };
			},
		}),
	});

	const result = await provider.generateContent({ contents: 'hello' });
	assert.equal(result.text, 'answer');
	assert.equal(result.model, 'gemini-test');
	assert.equal(result.usage.totalTokenCount, 42);
	assert.equal(result.finishReason, null);
	assert.equal(captured.model, 'gemini-test');
	assert.equal(captured.config.temperature, 0.2);
	assert.equal(captured.config.maxOutputTokens, 512);
});

test('generateContent fails with AI_NOT_CONFIGURED when no key or client exists', async () => {
	const provider = createLlmProvider({ apiKey: '' });
	await assert.rejects(provider.generateContent({ contents: 'hi' }), {
		statusCode: 503,
		code: 'AI_NOT_CONFIGURED',
	});
});

test('generateContent surfaces provider errors as AI_PROVIDER_ERROR', async () => {
	const provider = createLlmProvider({
		apiKey: 'test-key',
		maxRetries: 0,
		client: mockClient({
			generateContent: async () => {
				const error = new Error('internal');
				error.status = 500;
				throw error;
			},
		}),
	});
	await assert.rejects(provider.generateContent({ contents: 'hi' }), {
		statusCode: 502,
		code: 'AI_PROVIDER_ERROR',
	});
});

test('generateContent retries transient failures then succeeds', async () => {
	let calls = 0;
	const provider = createLlmProvider({
		apiKey: 'test-key',
		maxRetries: 2,
		client: mockClient({
			generateContent: async () => {
				calls += 1;
				if (calls === 1) {
					const error = new Error('quota');
					error.status = 429;
					throw error;
				}
				return { text: 'recovered', usageMetadata: {} };
			},
		}),
	});
	const result = await provider.generateContent({ contents: 'hi' });
	assert.equal(result.text, 'recovered');
	assert.equal(calls, 2);
});

test('generateContent maps persistent rate limiting to AI_RATE_LIMITED', async () => {
	const provider = createLlmProvider({
		apiKey: 'test-key',
		maxRetries: 1,
		client: mockClient({
			generateContent: async () => {
				const error = new Error('quota exceeded');
				error.status = 429;
				throw error;
			},
		}),
	});
	await assert.rejects(provider.generateContent({ contents: 'hi' }), {
		statusCode: 429,
		code: 'AI_RATE_LIMITED',
	});
});

test('generateContent times out slow requests with AI_TIMEOUT', async () => {
	const provider = createLlmProvider({
		apiKey: 'test-key',
		maxRetries: 0,
		requestTimeoutMs: 50,
		client: mockClient({
			generateContent: () => new Promise(() => {}),
		}),
	});
	await assert.rejects(provider.generateContent({ contents: 'hi' }), {
		statusCode: 504,
		code: 'AI_TIMEOUT',
	});
});

test('embedContent returns one vector per input with configured dimensions', async () => {
	let captured;
	const provider = createLlmProvider({
		apiKey: 'test-key',
		embeddingModel: 'gemini-embedding-001',
		embeddingDimensions: 768,
		client: mockClient({
			embedContent: async (params) => {
				captured = params;
				return {
					embeddings: params.contents.map(() => ({ values: new Array(768).fill(0.01) })),
				};
			},
		}),
	});

	const result = await provider.embedContent({
		contents: ['chunk one', 'chunk two'],
		taskType: 'RETRIEVAL_DOCUMENT',
	});
	assert.equal(result.embeddings.length, 2);
	assert.equal(result.embeddings[0].length, 768);
	assert.equal(result.dimensions, 768);
	assert.equal(captured.config.outputDimensionality, 768);
	assert.equal(captured.config.taskType, 'RETRIEVAL_DOCUMENT');
});

test('embedContent rejects empty or non-string contents', async () => {
	const provider = createLlmProvider({ apiKey: 'test-key', client: mockClient() });
	await assert.rejects(provider.embedContent({ contents: ['ok', '  '] }), {
		statusCode: 400,
		code: 'VALIDATION_ERROR',
	});
	await assert.rejects(provider.embedContent({ contents: [] }), {
		statusCode: 400,
		code: 'VALIDATION_ERROR',
	});
});

test('embedContent fails when returned dimensions do not match configuration', async () => {
	const provider = createLlmProvider({
		apiKey: 'test-key',
		embeddingDimensions: 768,
		client: mockClient({
			embedContent: async () => ({ embeddings: [{ values: [0.1, 0.2] }] }),
		}),
	});
	await assert.rejects(provider.embedContent({ contents: ['text'] }), {
		statusCode: 502,
		code: 'AI_PROVIDER_ERROR',
	});
});

test('provider does not retry non-retryable client errors', async () => {
	let calls = 0;
	const provider = createLlmProvider({
		apiKey: 'test-key',
		maxRetries: 3,
		client: mockClient({
			generateContent: async () => {
				calls += 1;
				const error = new Error('bad request');
				error.status = 400;
				throw error;
			},
		}),
	});
	await assert.rejects(provider.generateContent({ contents: 'hi' }), {
		statusCode: 502,
		code: 'AI_REQUEST_FAILED',
	});
	assert.equal(calls, 1);
});

test('embedContent formats gemini-embedding-2 documents with title/text instructions', async () => {
	let captured;
	const provider = createLlmProvider({
		apiKey: 'test-key',
		embeddingModel: 'gemini-embedding-2',
		embeddingDimensions: 768,
		client: mockClient({
			embedContent: async (params) => {
				captured = params;
				return {
					embeddings: params.contents.map(() => ({ values: new Array(768).fill(0.1) })),
				};
			},
		}),
	});

	await provider.embedContent({
		contents: [{ title: 'IPC Manual', text: 'Hand hygiene saves lives.' }],
		taskType: 'RETRIEVAL_DOCUMENT',
	});
	// gemini-embedding-2 receives each input as a Content object; the task
	// instruction is embedded in the text, not sent as a taskType parameter.
	assert.deepEqual(captured.contents[0], {
		parts: [{ text: 'title: IPC Manual | text: Hand hygiene saves lives.' }],
	});
	assert.equal(captured.config.taskType, undefined);
	assert.equal(captured.config.outputDimensionality, 768);
});

test('embedContent formats gemini-embedding-2 queries with task instructions', async () => {
	let captured;
	const provider = createLlmProvider({
		apiKey: 'test-key',
		embeddingModel: 'gemini-embedding-2',
		embeddingDimensions: 768,
		client: mockClient({
			embedContent: async (params) => {
				captured = params;
				return { embeddings: [{ values: new Array(768).fill(0.1) }] };
			},
		}),
	});

	await provider.embedContent({ contents: ['how to perform hand hygiene'], taskType: 'RETRIEVAL_QUERY' });
	assert.deepEqual(captured.contents[0], {
		parts: [{ text: 'task: search result | query: how to perform hand hygiene' }],
	});
	assert.equal(captured.config.taskType, undefined);
});

test('embedContent sends one Content object per input for gemini-embedding-2', async () => {
	let captured;
	const provider = createLlmProvider({
		apiKey: 'test-key',
		embeddingModel: 'gemini-embedding-2',
		embeddingDimensions: 768,
		client: mockClient({
			embedContent: async (params) => {
				captured = params;
				return {
					embeddings: params.contents.map(() => ({ values: new Array(768).fill(0.1) })),
				};
			},
		}),
	});
	const docs = Array.from({ length: 32 }, (_, i) => ({
		title: 'Doc',
		text: `chunk ${i}`,
	}));
	const result = await provider.embedContent({ contents: docs, taskType: 'RETRIEVAL_DOCUMENT' });
	assert.equal(captured.contents.length, 32);
	assert.ok(captured.contents.every((c) => Array.isArray(c.parts) && c.parts.length === 1));
	assert.equal(result.embeddings.length, 32);
	assert.ok(result.embeddings.every((v) => v.length === 768));
});

test('embedContent keeps taskType for gemini-embedding-001', async () => {
	let captured;
	const provider = createLlmProvider({
		apiKey: 'test-key',
		embeddingModel: 'gemini-embedding-001',
		embeddingDimensions: 768,
		client: mockClient({
			embedContent: async (params) => {
				captured = params;
				return { embeddings: [{ values: new Array(768).fill(0.1) }] };
			},
		}),
	});

	await provider.embedContent({ contents: ['plain text'], taskType: 'RETRIEVAL_QUERY' });
	assert.equal(captured.contents[0], 'plain text');
	assert.equal(captured.config.taskType, 'RETRIEVAL_QUERY');
});
