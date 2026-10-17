const repository = require('../repositories/messaging.repository');
const AppError = require('../errors/app-error');
const notificationService = require('./notifications.service');
const NotificationType = require('../enums/notification-type.enum');

const isActiveMentorMenteePair = async (firstUser, secondUser) => {
	const firstRole = String(firstUser?.role || '').toLowerCase();
	const secondRole = String(secondUser?.role || '').toLowerCase();
	if (!['mentor', 'mentee'].includes(firstRole) || !['mentor', 'mentee'].includes(secondRole) || firstRole === secondRole) {
		return false;
	}
	if ([firstUser, secondUser].some((user) => String(user.status || '').toLowerCase() !== 'active')) {
		return false;
	}

	const mentor = firstRole === 'mentor' ? firstUser : secondUser;
	const mentee = firstRole === 'mentee' ? firstUser : secondUser;
	return Boolean(await repository.hasActiveMentorAssignment({ mentorId: mentor.id, menteeId: mentee.id }));
};

const hasDirectConversationAccess = async (conversation, userId) => {
	const value = conversation.get ? conversation.get({ plain: true }) : conversation;
	if (value.type !== 'direct') return true;
	const currentParticipant = value.participants.find((participant) => participant.id === userId);
	const otherParticipant = value.participants.find((participant) => participant.id !== userId);
	return Boolean(currentParticipant && otherParticipant
		&& await isActiveMentorMenteePair(currentParticipant, otherParticipant));
};

const ensureParticipant = async (conversationId, userId) => {
	const conversation = await repository.getConversation(conversationId);
	if (!conversation) throw new AppError('Conversation not found.', 404, 'NOT_FOUND');
	if (!conversation.participants.some((participant) => participant.id === userId)) {
		throw new AppError('You do not have access to this conversation.', 403, 'FORBIDDEN');
	}
	if (!(await hasDirectConversationAccess(conversation, userId))) {
		throw new AppError('You do not have access to this conversation.', 403, 'FORBIDDEN');
	}
	return conversation;
};

const listContacts = async (userId, role, q) => {
	const normalizedRole = String(role || '').toLowerCase();
	if (!['mentor', 'mentee'].includes(normalizedRole)) {
		throw new AppError('Only mentors and mentees can view messaging contacts.', 403, 'FORBIDDEN');
	}
	return repository.listContactsForUser({ userId, role: normalizedRole, q });
};

const listConversations = async (userId) => {
	const records = await repository.listConversationsForUser(userId);
	const accessChecks = await Promise.all(records.map(({ conversation }) => hasDirectConversationAccess(conversation, userId)));
	return records.filter((record, index) => accessChecks[index]);
};

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
	if (type === 'direct') {
		const currentUser = users.find((user) => user.id === userId);
		const otherParticipant = users.find((user) => user.id !== userId);
		if (!otherParticipant || !(await isActiveMentorMenteePair(currentUser, otherParticipant))) {
			throw new AppError('You can only start a direct conversation with an assigned mentor or mentee.', 403, 'FORBIDDEN');
		}
	}

	return repository.createConversation({ userId, participantIds: allParticipantIds, type });
};

const sendMessage = async ({ conversationId, userId, content, attachmentFileId }) => {
	const conversation = await ensureParticipant(conversationId, userId);
	if (attachmentFileId) {
		const file = await repository.getUploadedFile(attachmentFileId);
		if (!file) throw new AppError('Attachment not found.', 404, 'NOT_FOUND');
		if (file.owner_id !== userId) {
			throw new AppError('You cannot attach a file you do not own.', 403, 'FORBIDDEN');
		}
	}
	const message = await repository.createMessage({ conversationId, senderId: userId, content, attachmentFileId });
	const recipientIds = conversation.participants
		.map((participant) => Number(participant.id))
		.filter((participantId) => participantId !== Number(userId));
	await notificationService.createNotifications({
		userIds: recipientIds,
		type: NotificationType.MESSAGE_RECEIVED,
		title: 'New message',
		body: 'You received a new message.',
		referenceType: 'conversation',
		referenceId: conversationId,
	});
	return message;
};

const ensureMessageOwner = async ({ conversationId, messageId, userId }) => {
	await ensureParticipant(conversationId, userId);
	const message = await repository.getMessage(conversationId, messageId);
	if (!message) throw new AppError('Message not found.', 404, 'NOT_FOUND');
	if (message.sender_id !== userId) {
		throw new AppError('You can only change your own messages.', 403, 'FORBIDDEN');
	}
};

const editMessage = async ({ conversationId, messageId, userId, content }) => {
	await ensureMessageOwner({ conversationId, messageId, userId });
	const message = await repository.updateMessage({ conversationId, messageId, userId, content });
	if (!message) throw new AppError('Message not found.', 404, 'NOT_FOUND');
	return message;
};

const deleteMessage = async ({ conversationId, messageId, userId }) => {
	await ensureMessageOwner({ conversationId, messageId, userId });
	const deleted = await repository.deleteMessage({ conversationId, messageId, userId });
	if (!deleted) throw new AppError('Message not found.', 404, 'NOT_FOUND');
};

const markRead = async ({ conversationId, userId }) => {
	await ensureParticipant(conversationId, userId);
	return { markedRead: await repository.markConversationRead({ conversationId, userId }) };
};

module.exports = {
	listContacts,
	listConversations,
	getConversation,
	createConversation,
	sendMessage,
	editMessage,
	deleteMessage,
	markRead,
};
