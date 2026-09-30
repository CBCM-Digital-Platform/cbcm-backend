const repository = require('../repositories/messaging.repository');
const AppError = require('../errors/app-error');

const ensureParticipant = async (conversationId, userId) => {
	const conversation = await repository.getConversation(conversationId);
	if (!conversation) throw new AppError('Conversation not found.', 404, 'NOT_FOUND');
	if (!conversation.participants.some((participant) => participant.id === userId)) {
		throw new AppError('You do not have access to this conversation.', 403, 'FORBIDDEN');
	}
	return conversation;
};

const listConversations = (userId) => repository.listConversationsForUser(userId);

const getConversation = async (conversationId, userId) => {
	await ensureParticipant(conversationId, userId);
	return repository.getConversationWithMessages(conversationId);
};

const createConversation = async ({ userId, participantIds, type }) => {
	const allParticipantIds = [...new Set([...participantIds, userId])];
	if (allParticipantIds.length < 2 || (type === 'direct' && allParticipantIds.length !== 2)) {
		throw new AppError('A conversation must include another user; direct conversations must have two participants.', 400, 'VALIDATION_ERROR');
	}

	const users = await repository.getUsersByIds(allParticipantIds);
	if (users.length !== allParticipantIds.length) {
		throw new AppError('One or more participants do not exist.', 400, 'VALIDATION_ERROR');
	}

	return repository.createConversation({ userId, participantIds: allParticipantIds, type });
};

const sendMessage = async ({ conversationId, userId, content, attachmentFileId }) => {
	await ensureParticipant(conversationId, userId);
	if (attachmentFileId) {
		const file = await repository.getUploadedFile(attachmentFileId);
		if (!file) throw new AppError('Attachment not found.', 404, 'NOT_FOUND');
		if (file.owner_id !== userId) {
			throw new AppError('You cannot attach a file you do not own.', 403, 'FORBIDDEN');
		}
	}
	return repository.createMessage({ conversationId, senderId: userId, content, attachmentFileId });
};

const markRead = async ({ conversationId, userId }) => {
	await ensureParticipant(conversationId, userId);
	return { markedRead: await repository.markConversationRead({ conversationId, userId }) };
};

module.exports = { listConversations, getConversation, createConversation, sendMessage, markRead };
