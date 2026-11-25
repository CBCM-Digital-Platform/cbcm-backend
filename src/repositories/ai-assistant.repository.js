const { Op } = require('sequelize');
const models = require('../models');

const MESSAGE_ROLES = Object.freeze(['user', 'assistant', 'system']);
const FEEDBACK_RATINGS = Object.freeze(['up', 'down']);
const SAFETY_CATEGORIES = Object.freeze(['emergency', 'patient_specific', 'prompt_injection', 'unsupported_clinical']);

// ---------- Conversations ----------

async function createConversation({ userId, title }) {
	return models.AIConversation.create({
		user_id: userId,
		title: title || null,
		status: 'active',
	});
}

async function listConversations(userId, { page = 1, limit = 20, status = 'active' } = {}) {
	const where = { user_id: userId };
	if (status) where.status = status;
	const offset = (page - 1) * limit;
	const { rows, count } = await models.AIConversation.findAndCountAll({
		where,
		order: [['last_message_at', 'DESC NULLS LAST'], ['updated_at', 'DESC']],
		limit,
		offset,
	});
	return { items: rows, total: count, page, limit };
}

async function findConversationById(id, userId, { transaction } = {}) {
	const where = { id };
	if (userId !== undefined && userId !== null) where.user_id = userId;
	return models.AIConversation.findOne({ where, transaction });
}

async function updateConversation(id, data, transaction) {
	const conversation = await models.AIConversation.findByPk(id, { transaction });
	if (!conversation) return null;
	await conversation.update(data, { transaction });
	return conversation;
}

async function archiveConversation(id, userId) {
	const [updated] = await models.AIConversation.update(
		{ status: 'archived' },
		{ where: { id, user_id: userId, status: 'active' } }
	);
	return updated > 0;
}

// ---------- Messages ----------

async function createMessage(data, transaction) {
	return models.AIMessage.create({
		conversation_id: data.conversation_id,
		role: data.role,
		content: data.content,
		attachment_file_id: data.attachment_file_id ?? null,
		model: data.model ?? null,
		token_usage: data.token_usage ?? null,
		created_at: new Date(),
	}, { transaction });
}

async function listMessages(conversationId, { limit = 100, beforeId } = {}) {
	const where = { conversation_id: conversationId };
	if (beforeId) where.id = { [Op.lt]: beforeId };
	return models.AIMessage.findAll({
		where,
		order: [['id', 'DESC']],
		limit,
		include: [{
			model: models.AIMessageCitation,
			as: 'citations',
			required: false,
		}],
	});
}

async function findMessageById(id) {
	return models.AIMessage.findByPk(id, {
		include: [{ model: models.AIMessageCitation, as: 'citations', required: false }],
	});
}

async function createCitations(messageId, citations, transaction) {
	if (!citations?.length) return [];
	return models.AIMessageCitation.bulkCreate(
		citations.map((citation) => ({
			message_id: messageId,
			source: citation.source || null,
			excerpt: citation.excerpt || null,
			url: citation.url || null,
			document_id: citation.document_id ?? citation.documentId ?? null,
			document_version_id: citation.document_version_id ?? citation.documentVersionId ?? null,
			chunk_id: citation.chunk_id ?? citation.chunkId ?? null,
			page_number: citation.page_number ?? citation.pageNumber ?? null,
			section_heading: citation.section_heading ?? citation.sectionHeading ?? null,
		})),
		{ transaction }
	);
}

async function touchConversation(conversationId, transaction) {
	await models.AIConversation.update(
		{ last_message_at: new Date() },
		{ where: { id: conversationId }, transaction }
	);
}

// ---------- Feedback ----------

async function createFeedback({ messageId, userId, rating, comment }, transaction) {
	return models.AIFeedback.create({
		message_id: messageId,
		user_id: userId,
		rating,
		comment: comment || null,
		created_at: new Date(),
	}, { transaction });
}

async function findFeedbackByMessageAndUser(messageId, userId) {
	return models.AIFeedback.findOne({ where: { message_id: messageId, user_id: userId } });
}

// ---------- Usage logs ----------

async function createUsageLog(data, transaction) {
	return models.AIUsageLog.create({
		user_id: data.user_id ?? null,
		conversation_id: data.conversation_id ?? null,
		message_id: data.message_id ?? null,
		model: data.model ?? null,
		prompt_tokens: data.prompt_tokens ?? null,
		completion_tokens: data.completion_tokens ?? null,
		total_tokens: data.total_tokens ?? null,
		latency_ms: data.latency_ms ?? null,
		status: data.status ?? 'success',
		error_code: data.error_code ?? null,
		created_at: new Date(),
	}, { transaction });
}

async function usageSummary({ startDate, endDate, groupBy = 'day' } = {}) {
	const where = {};
	if (startDate || endDate) {
		where.created_at = {};
		if (startDate) where.created_at[Op.gte] = startDate;
		if (endDate) where.created_at[Op.lte] = endDate;
	}
	const logs = await models.AIUsageLog.findAll({
		where,
		attributes: ['id', 'user_id', 'model', 'prompt_tokens', 'completion_tokens', 'total_tokens', 'latency_ms', 'status', 'error_code', 'created_at'],
		order: [['created_at', 'DESC']],
		limit: 500,
	});
	const totals = logs.reduce((acc, log) => {
		acc.requests += 1;
		acc.promptTokens += Number(log.prompt_tokens || 0);
		acc.completionTokens += Number(log.completion_tokens || 0);
		acc.totalTokens += Number(log.total_tokens || 0);
		if (log.status !== 'success') acc.errors += 1;
		return acc;
	}, { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, errors: 0 });
	return { items: logs, totals, groupBy };
}

// ---------- Safety events ----------

async function createSafetyEvent({ userId, conversationId, category, detail }, transaction) {
	return models.AISafetyEvent.create({
		user_id: userId ?? null,
		conversation_id: conversationId ?? null,
		category,
		detail: typeof detail === 'string' ? detail.slice(0, 2000) : null,
		created_at: new Date(),
	}, { transaction });
}

module.exports = {
	MESSAGE_ROLES,
	FEEDBACK_RATINGS,
	SAFETY_CATEGORIES,
	createConversation,
	listConversations,
	findConversationById,
	updateConversation,
	archiveConversation,
	createMessage,
	listMessages,
	findMessageById,
	createCitations,
	createFeedback,
	findFeedbackByMessageAndUser,
	touchConversation,
	createUsageLog,
	usageSummary,
	createSafetyEvent,
};
