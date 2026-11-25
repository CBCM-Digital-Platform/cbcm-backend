const { sequelize } = require('../models');
const AppError = require('../errors/app-error');
const Role = require('../enums/role.enum');
const { getLlmProvider } = require('../providers/llm.provider');
const { getRagRetriever, ROLE_ACCESS_SCOPE } = require('../providers/rag-retriever.provider');
const repository = require('../repositories/ai-assistant.repository');
const safetyService = require('./ai-safety.service');
const usageService = require('./ai-usage.service');
const contextService = require('./ai-context.service');
const assistantService = require('./ai-assistant.service');
const { buildMenteePrompt } = require('../prompts/mentee.prompt');
const { buildMentorPrompt } = require('../prompts/mentor.prompt');
const { buildSourcesFooter } = require('../prompts/system.prompt');

const CHAT_ROLES = Object.freeze([Role.MENTEE, Role.MENTOR, Role.FACILITY_ADMIN, Role.ADMIN]);

function toCitation(chunk) {
	return {
		source: chunk.document_title || 'CBCM Knowledge Base',
		excerpt: String(chunk.content || '').slice(0, 500),
		document_id: chunk.document_id,
		document_version_id: chunk.document_version_id || null,
		chunk_id: chunk.chunk_id,
		page_number: chunk.page_number ?? null,
		section_heading: chunk.section_heading || null,
	};
}

function dedupeChunks(chunks) {
	const seen = new Set();
	return (chunks || []).filter((chunk) => {
		const key = `${chunk.document_id}:${chunk.chunk_id}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

async function sendMessage({ user, conversationId, content, llm, retriever } = {}) {
	const role = String(user?.role || '').toLowerCase();
	if (!CHAT_ROLES.includes(role)) {
		throw new AppError('Your role does not have access to the AI assistant.', 403, 'FORBIDDEN');
	}
	const text = String(content || '').trim();
	if (!text) {
		throw new AppError('Message content is required.', 400, 'VALIDATION_ERROR');
	}
	if (text.length > 4000) {
		throw new AppError('Message content must not exceed 4000 characters.', 400, 'VALIDATION_ERROR');
	}

	const conversation = await repository.findConversationById(Number(conversationId), user.id);
	if (!conversation) {
		throw new AppError('Conversation not found.', 404, 'NOT_FOUND');
	}
	if (conversation.status !== 'active') {
		throw new AppError('This conversation is archived.', 409, 'CONVERSATION_ARCHIVED');
	}

	// Safety gate runs before any provider call.
	const safety = await safetyService.evaluateMessage({
		content: text,
		userId: user.id,
		conversationId: conversation.id,
	});

	const startedAt = Date.now();
	const provider = llm || getLlmProvider();

	// Persist the user message first so history includes it on retry paths.
	const userMessage = await sequelize.transaction(async (transaction) => {
		const message = await repository.createMessage({
			conversation_id: conversation.id,
			role: 'user',
			content: text,
		}, transaction);
		await repository.touchConversation(conversation.id, transaction);
		return message;
	});

	// Emergency short-circuit: no provider call, no retrieval.
	if (safety.finding?.category === 'emergency') {
		const assistantMessage = await repository.createMessage({
			conversation_id: conversation.id,
			role: 'assistant',
			content: safety.response,
			model: 'safety-filter',
		});
		await usageService.logUsage({
			user_id: user.id,
			conversation_id: conversation.id,
			message_id: assistantMessage.id,
			model: 'safety-filter',
			status: 'blocked',
			error_code: 'SAFETY_EMERGENCY',
			latency_ms: Date.now() - startedAt,
		});
		return {
			conversationId: conversation.id,
			userMessageId: userMessage.id,
			assistantMessage: {
				id: assistantMessage.id,
				role: 'assistant',
				content: safety.response,
				citations: [],
				sources: [],
				safetyNotice: true,
				createdAt: assistantMessage.created_at,
			},
			sources: [],
			usage: null,
		};
	}

	try {
		const context = await contextService.buildAssistantContext(user);
		const rag = retriever || getRagRetriever();
		const rawChunks = await rag.retrieve({
			query: text,
			filters: {
				accessScope: ROLE_ACCESS_SCOPE[role] || 'all',
			},
		});
		const chunks = dedupeChunks(rawChunks);

		const history = (await repository.listMessages(conversation.id, { limit: assistantService.HISTORY_LIMIT }))
			.filter((message) => message.id !== userMessage.id && ['user', 'assistant'].includes(message.role))
			.reverse()
			.map((message) => ({ role: message.role, content: message.content }));

		const mentorContext = context.personalized && role === Role.MENTOR
			? 'Mentor profile context is available per privacy configuration.'
			: null;

		const prompt = role === Role.MENTOR || role === Role.FACILITY_ADMIN || role === Role.ADMIN
			? buildMentorPrompt({ question: text, history, chunks, mentorContext })
			: buildMenteePrompt({ question: text, history, chunks });

		if (safety.notice) {
			// Patient-data notice is appended as a system-style instruction line.
			prompt += `\n\nAdditional instruction: ${safety.notice}`;
		}

		const generated = await provider.generateContent({
			contents: [{ role: 'user', parts: [{ text: prompt }] }],
		});

		const citations = chunks.map(toCitation);
		const sources = buildSourcesFooter(chunks)
			? JSON.parse(buildSourcesFooter(chunks))
			: [];

		const tokenUsage = usageService.extractTokenUsage(generated.usage);
		const assistantMessage = await sequelize.transaction(async (transaction) => {
			const message = await repository.createMessage({
				conversation_id: conversation.id,
				role: 'assistant',
				content: generated.text,
				model: generated.model,
				token_usage: generated.usage || null,
			}, transaction);
			await repository.createCitations(message.id, citations, transaction);
			await repository.touchConversation(conversation.id, transaction);
			return message;
		});

		await usageService.logUsage({
			user_id: user.id,
			conversation_id: conversation.id,
			message_id: assistantMessage.id,
			model: generated.model,
			...tokenUsage,
			latency_ms: Date.now() - startedAt,
			status: 'success',
		});

		return {
			conversationId: conversation.id,
			userMessageId: userMessage.id,
			assistantMessage: {
				id: assistantMessage.id,
				role: 'assistant',
				content: generated.text,
				model: generated.model,
				tokenUsage: generated.usage || null,
				citations,
				sources,
				safetyNotice: Boolean(safety.notice),
				createdAt: assistantMessage.created_at,
			},
			sources,
			usage: {
				model: generated.model,
				...tokenUsage,
				latencyMs: Date.now() - startedAt,
				retrievedChunks: chunks.length,
			},
		};
	} catch (error) {
		await usageService.logUsage({
			user_id: user.id,
			conversation_id: conversation.id,
			model: null,
			latency_ms: Date.now() - startedAt,
			status: 'error',
			error_code: error?.code || 'AI_ERROR',
		});
		throw error;
	}
}

module.exports = {
	sendMessage,
	toCitation,
	dedupeChunks,
};
