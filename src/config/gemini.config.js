const env = require('./env');
const AppError = require('../errors/app-error');

const geminiConfig = Object.freeze({
	apiKey: env.GEMINI_API_KEY,
	model: env.GEMINI_MODEL,
	embeddingModel: env.GEMINI_EMBEDDING_MODEL,
	embeddingDimensions: env.GEMINI_EMBEDDING_DIMENSIONS,
	maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
	temperature: env.AI_TEMPERATURE,
	maxRetrievedChunks: env.AI_MAX_RETRIEVED_CHUNKS,
	requestTimeoutMs: env.AI_REQUEST_TIMEOUT,
	maxRetries: env.AI_MAX_RETRIES,
});

function isGeminiConfigured() {
	return Boolean(geminiConfig.apiKey);
}

function assertGeminiConfigured() {
	if (!isGeminiConfigured()) {
		throw new AppError(
			'The AI assistant is not configured. A Gemini API key is required.',
			503,
			'AI_NOT_CONFIGURED'
		);
	}
}

// Privacy gate: when false (default), mentee/mentor profile data, assessment
// results, and other user-specific information must NOT be included in prompts
// sent to Gemini. Enable only after organizational privacy/legal approval.
function isUserContextSharingEnabled() {
	return env.AI_SEND_USER_CONTEXT === true;
}

module.exports = {
	geminiConfig,
	isGeminiConfigured,
	assertGeminiConfigured,
	isUserContextSharingEnabled,
};
