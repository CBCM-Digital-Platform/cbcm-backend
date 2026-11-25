const { getLlmProvider } = require('./llm.provider');
const knowledgeRepository = require('../repositories/ai-knowledge.repository');
const { geminiConfig } = require('../config/gemini.config');
const Role = require('../enums/role.enum');

const ROLE_ACCESS_SCOPE = Object.freeze({
	[Role.MENTOR]: 'mentors',
	[Role.MENTEE]: 'mentees',
	[Role.FACILITY_ADMIN]: 'facility_admins',
	[Role.ADMIN]: 'all',
});

function createRagRetriever({ llm, repository } = {}) {
	const provider = llm || getLlmProvider();
	const repo = repository || knowledgeRepository;

	async function retrieve({ query, limit, filters = {} } = {}) {
		const text = String(query || '').trim();
		if (!text) return [];
		const { embeddings } = await provider.embedContent({
			contents: [text],
			taskType: 'RETRIEVAL_QUERY',
		});
		const accessScope = filters.accessScope || 'all';
		const chunks = await repo.searchSimilarChunks({
			queryEmbedding: embeddings[0],
			limit: limit || geminiConfig.maxRetrievedChunks,
			language: filters.language || null,
			thematicAreaId: filters.thematicAreaId || null,
			accessScope,
			documentId: filters.documentId || null,
		});
		return chunks;
	}

	// Diagnostic retrieval for authorized administrators — same pipeline but
	// allows inspecting raw chunks without an access-scope downgrade.
	async function retrieveForDiagnostics({ query, limit, filters = {} } = {}) {
		return retrieve({ query, limit: limit || 10, filters: { ...filters, accessScope: filters.accessScope || 'all' } });
	}

	return {
		name: 'pgvector-gemini',
		retrieve,
		retrieveForDiagnostics,
	};
}

let sharedRetriever = null;

function getRagRetriever() {
	if (!sharedRetriever) {
		sharedRetriever = createRagRetriever();
	}
	return sharedRetriever;
}

module.exports = {
	createRagRetriever,
	getRagRetriever,
	ROLE_ACCESS_SCOPE,
};
