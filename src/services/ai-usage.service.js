const repository = require('../repositories/ai-assistant.repository');

async function logUsage(data) {
	try {
		return await repository.createUsageLog(data);
	} catch (error) {
		console.error('AI usage logging failed:', error?.message || error);
		return null;
	}
}

function extractTokenUsage(usage) {
	if (!usage || typeof usage !== 'object') return {};
	return {
		prompt_tokens: Number(usage.promptTokenCount ?? usage.prompt_tokens ?? 0) || null,
		completion_tokens: Number(usage.candidatesTokenCount ?? usage.completion_tokens ?? 0) || null,
		total_tokens: Number(usage.totalTokenCount ?? usage.total_tokens ?? 0) || null,
	};
}

async function getUsageSummary(filters = {}) {
	return repository.usageSummary(filters);
}

module.exports = {
	logUsage,
	extractTokenUsage,
	getUsageSummary,
};
