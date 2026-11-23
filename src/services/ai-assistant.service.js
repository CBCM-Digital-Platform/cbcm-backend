const AppError = require('../errors/app-error');
const { hasAnyRole, FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');
const { geminiConfig, isGeminiConfigured, isUserContextSharingEnabled } = require('../config/gemini.config');
const Role = require('../enums/role.enum');
const repository = require('../repositories/ai-assistant.repository');
const usageService = require('./ai-usage.service');

const AI_ROLES = Object.freeze([Role.ADMIN, Role.FACILITY_ADMIN, Role.MENTOR, Role.MENTEE]);
const HISTORY_LIMIT = 20;
const DEFAULT_PAGE_SIZE = 20;

function requireAiUser(user) {
	const role = String(user?.role || '').toLowerCase();
	if (!AI_ROLES.includes(role)) {
		throw new AppError('Your role does not have access to the AI assistant.', 403, 'FORBIDDEN');
	}
	return role;
}

function toConversationResponse(conversation, { messageCount } = {}) {
	const plain = typeof conversation.toJSON === 'function' ? conversation.toJSON() : conversation;
	return {
		id: plain.id,
		title: plain.title ?? null,
		status: plain.status || 'active',
		lastMessageAt: plain.last_message_at ?? null,
		createdAt: plain.created_at,
		updatedAt: plain.updated_at,
		...(messageCount !== undefined ? { messageCount } : {}),
	};
}

async function createConversation({ user, title }) {
	requireAiUser(user);
	const conversation = await repository.createConversation({
		userId: user.id,
		title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 200) : null,
	});
	return toConversationResponse(conversation);
}

async function listConversations({ user, page = 1, limit = DEFAULT_PAGE_SIZE, status }) {
	requireAiUser(user);
	const result = await repository.listConversations(user.id, {
		page: Number(page) || 1,
		limit: Math.min(Number(limit) || DEFAULT_PAGE_SIZE, 100),
		status: status || 'active',
	});
	return {
		items: result.items.map((c) => toConversationResponse(c)),
		total: result.total,
		page: result.page,
		limit: result.limit,
	};
}

async function getConversation({ user, id }) {
	requireAiUser(user);
	const conversation = await repository.findConversationById(Number(id), user.id);
	if (!conversation) {
		throw new AppError('Conversation not found.', 404, 'NOT_FOUND');
	}
	return toConversationResponse(conversation);
}

async function listMessages({ user, conversationId, limit, beforeId }) {
	requireAiUser(user);
	const conversation = await repository.findConversationById(Number(conversationId), user.id);
	if (!conversation) {
		throw new AppError('Conversation not found.', 404, 'NOT_FOUND');
	}
	const messages = await repository.listMessages(conversation.id, {
		limit: Math.min(Number(limit) || 100, 200),
		beforeId: beforeId ? Number(beforeId) : undefined,
	});
	return messages.reverse().map((message) => {
		const plain = typeof message.toJSON === 'function' ? message.toJSON() : message;
		return {
			id: plain.id,
			conversationId: plain.conversation_id,
			role: plain.role,
			content: plain.content,
			model: plain.model ?? null,
			tokenUsage: plain.token_usage ?? null,
			citations: (plain.citations || []).map((citation) => ({
				id: citation.id,
				source: citation.source,
				excerpt: citation.excerpt,
				url: citation.url,
				documentId: citation.document_id,
				documentVersionId: citation.document_version_id,
				chunkId: citation.chunk_id,
				pageNumber: citation.page_number,
				sectionHeading: citation.section_heading,
			})),
			createdAt: plain.created_at,
		};
	});
}

async function archiveConversation({ user, id }) {
	requireAiUser(user);
	const archived = await repository.archiveConversation(Number(id), user.id);
	if (!archived) {
		throw new AppError('Conversation not found or already archived.', 404, 'NOT_FOUND');
	}
	return { id: Number(id), status: 'archived' };
}

async function submitFeedback({ user, messageId, rating, comment }) {
	requireAiUser(user);
	const message = await repository.findMessageById(Number(messageId));
	if (!message) {
		throw new AppError('Message not found.', 404, 'NOT_FOUND');
	}
	const conversation = await repository.findConversationById(message.conversation_id, user.id);
	if (!conversation) {
		throw new AppError('You can only provide feedback on your own messages.', 403, 'FORBIDDEN');
	}
	if (message.role !== 'assistant') {
		throw new AppError('Feedback can only be submitted on assistant messages.', 400, 'VALIDATION_ERROR');
	}
	const existing = await repository.findFeedbackByMessageAndUser(message.id, user.id);
	if (existing) {
		await existing.update({ rating, comment: comment || null });
		return { id: existing.id, messageId: message.id, rating, updated: true };
	}
	const feedback = await repository.createFeedback({
		messageId: message.id,
		userId: user.id,
		rating,
		comment,
	});
	return { id: feedback.id, messageId: message.id, rating, updated: false };
}

async function getStatus() {
	return {
		configured: isGeminiConfigured(),
		model: geminiConfig.model,
		embeddingModel: geminiConfig.embeddingModel,
		embeddingDimensions: geminiConfig.embeddingDimensions,
		privacyGate: {
			userContextSharing: isUserContextSharingEnabled(),
		},
	};
}

async function getUsage({ actor, startDate, endDate }) {
	if (!hasAnyRole(actor?.role, FACILITY_MANAGEMENT_ROLES)) {
		throw new AppError('Only administrators can view AI usage.', 403, 'FORBIDDEN');
	}
	return usageService.getUsageSummary({ startDate, endDate });
}

module.exports = {
	HISTORY_LIMIT,
	createConversation,
	listConversations,
	getConversation,
	listMessages,
	archiveConversation,
	submitFeedback,
	getStatus,
	getUsage,
};
