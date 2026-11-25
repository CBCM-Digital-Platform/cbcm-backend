const { GoogleGenAI } = require('@google/genai');
const AppError = require('../errors/app-error');
const { geminiConfig } = require('../config/gemini.config');

const DEFAULT_TIMEOUT_MS = 60000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

const EMBEDDING_2_MODEL_PATTERN = /gemini-embedding-2/;

// gemini-embedding-2 uses task instructions embedded in the input text instead
// of the taskType parameter used by gemini-embedding-001.
// See https://ai.google.dev/gemini-api/docs/embeddings
const EMBEDDING_2_QUERY_TASKS = Object.freeze({
	RETRIEVAL_QUERY: 'search result',
	QUESTION_ANSWERING: 'question answering',
	FACT_CHECKING: 'fact checking',
	CODE_RETRIEVAL: 'code retrieval',
});

function isEmbedding2Model(model) {
	return EMBEDDING_2_MODEL_PATTERN.test(String(model || ''));
}

function normalizeEmbeddingItem(item) {
	if (typeof item === 'string') return { title: null, text: item };
	if (item && typeof item === 'object' && typeof item.text === 'string') {
		return { title: item.title || null, text: item.text };
	}
	return { title: null, text: '' };
}

function formatEmbedding2Item(item, taskType) {
	const { title, text } = normalizeEmbeddingItem(item);
	if (!text.trim()) {
		throw providerError('Embedding contents must be non-empty strings.', 400, 'VALIDATION_ERROR');
	}
	if (taskType === 'RETRIEVAL_DOCUMENT') {
		return `title: ${title || 'none'} | text: ${text}`;
	}
	const task = EMBEDDING_2_QUERY_TASKS[taskType] || 'search result';
	return `task: ${task} | query: ${text}`;
}

function formatEmbedding1Item(item, taskType) {
	const { text } = normalizeEmbeddingItem(item);
	if (!text.trim()) {
		throw providerError('Embedding contents must be non-empty strings.', 400, 'VALIDATION_ERROR');
	}
	return text;
}

function providerError(message, statusCode, code, details = []) {
	return new AppError(message, statusCode, code, details);
}

function extractStatus(error) {
	const status = Number(error?.status ?? error?.code ?? error?.response?.status);
	return Number.isFinite(status) ? status : null;
}

function isRetryableError(error) {
	const status = extractStatus(error);
	if (status === 429 || (status !== null && status >= 500)) return true;
	const message = String(error?.message || error || '').toLowerCase();
	return /rate.?limit|resource_exhausted|unavailable|deadline|timeout|econnreset|socket hang up/.test(message);
}

function classifyError(error) {
	if (error instanceof AppError) return error;
	const status = extractStatus(error);
	if (status === 429) {
		return providerError('The AI service is rate limited. Please try again shortly.', 429, 'AI_RATE_LIMITED');
	}
	if (status === 400 || status === 401 || status === 403) {
		return providerError('The AI service rejected the request.', 502, 'AI_REQUEST_FAILED', [String(error?.message || '')]);
	}
	return providerError('The AI service is temporarily unavailable.', 502, 'AI_PROVIDER_ERROR');
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function createLlmProvider(options = {}) {
	const config = {
		apiKey: options.apiKey ?? geminiConfig.apiKey,
		model: options.model ?? geminiConfig.model,
		embeddingModel: options.embeddingModel ?? geminiConfig.embeddingModel,
		embeddingDimensions: options.embeddingDimensions ?? geminiConfig.embeddingDimensions,
		maxOutputTokens: options.maxOutputTokens ?? geminiConfig.maxOutputTokens,
		temperature: options.temperature ?? geminiConfig.temperature,
		requestTimeoutMs: options.requestTimeoutMs ?? geminiConfig.requestTimeoutMs ?? DEFAULT_TIMEOUT_MS,
		maxRetries: options.maxRetries ?? geminiConfig.maxRetries ?? DEFAULT_MAX_RETRIES,
	};

	let client = options.client || null;

	function getClient() {
		if (client) return client;
		if (!config.apiKey) {
			throw providerError(
				'The AI assistant is not configured. A Gemini API key is required.',
				503,
				'AI_NOT_CONFIGURED'
			);
		}
		client = new GoogleGenAI({ apiKey: config.apiKey });
		return client;
	}

	async function withTimeout(promiseFactory, timeoutMs, label) {
		let timer;
		const timeoutPromise = new Promise((_, reject) => {
			timer = setTimeout(() => {
				reject(providerError(`The AI request timed out while ${label}.`, 504, 'AI_TIMEOUT'));
			}, timeoutMs);
		});
		try {
			return await Promise.race([promiseFactory(), timeoutPromise]);
		} finally {
			clearTimeout(timer);
		}
	}

	async function callWithRetry(operation, label) {
		let lastError;
		for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
			try {
				return await withTimeout(operation, config.requestTimeoutMs, label);
			} catch (error) {
				lastError = error;
				if (error instanceof AppError || !isRetryableError(error) || attempt === config.maxRetries) {
					break;
				}
				const backoff = RETRY_BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * 100);
				await delay(backoff);
			}
		}
		throw classifyError(lastError);
	}

	function assertConfigured() {
		if (!config.apiKey && !client) {
			throw providerError(
				'The AI assistant is not configured. A Gemini API key is required.',
				503,
				'AI_NOT_CONFIGURED'
			);
		}
	}

	async function generateContent({ contents, model, generationConfig = {} } = {}) {
		assertConfigured();
		const targetModel = model || config.model;
		const response = await callWithRetry(
			() => getClient().models.generateContent({
				model: targetModel,
				contents,
				config: {
					temperature: config.temperature,
					maxOutputTokens: config.maxOutputTokens,
					...generationConfig,
				},
			}),
			'generating a response'
		);
		return {
			text: typeof response?.text === 'string' ? response.text : '',
			model: targetModel,
			usage: response?.usageMetadata || null,
			finishReason: response?.candidates?.[0]?.finishReason || null,
		};
	}

	async function embedContent({ contents, taskType = 'RETRIEVAL_QUERY' } = {}) {
		assertConfigured();
		const items = (Array.isArray(contents) ? contents : [contents])
			.map((item) => (isEmbedding2Model(config.embeddingModel)
				? formatEmbedding2Item(item, taskType)
				: formatEmbedding1Item(item, taskType)));
		if (items.length === 0) {
			throw providerError('Embedding contents must be non-empty strings.', 400, 'VALIDATION_ERROR');
		}
		const embedding2 = isEmbedding2Model(config.embeddingModel);
		const embeddingConfig = { outputDimensionality: config.embeddingDimensions };
		if (!embedding2) {
			embeddingConfig.taskType = taskType;
		}
		// gemini-embedding-2 requires each input as a separate Content object;
		// passing an array of plain strings is treated as a single input.
		const requestContents = embedding2
			? items.map((text) => ({ parts: [{ text }] }))
			: items;
		const response = await callWithRetry(
			() => getClient().models.embedContent({
				model: config.embeddingModel,
				contents: requestContents,
				config: embeddingConfig,
			}),
			'generating embeddings'
		);
		const embeddings = (response?.embeddings || []).map((entry) => entry?.values || []);
		if (embeddings.length !== items.length || embeddings.some((vector) => vector.length !== config.embeddingDimensions)) {
			throw providerError('The embedding service returned an unexpected result.', 502, 'AI_PROVIDER_ERROR');
		}
		return {
			embeddings,
			model: config.embeddingModel,
			dimensions: config.embeddingDimensions,
			usage: response?.usageMetadata || response?.usage || null,
		};
	}

	return {
		name: 'gemini',
		generateContent,
		embedContent,
		isConfigured: () => Boolean(config.apiKey),
	};
}

let sharedProvider = null;

function getLlmProvider() {
	if (!sharedProvider) {
		sharedProvider = createLlmProvider();
	}
	return sharedProvider;
}

module.exports = {
	createLlmProvider,
	getLlmProvider,
};
