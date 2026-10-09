const { Op, QueryTypes } = require('sequelize');
const models = require('../models');

const safeUserAttributes = ['id', 'full_name', 'role', 'avatar_url'];
const participantInclude = {
	model: models.User,
	as: 'participants',
	attributes: safeUserAttributes,
	through: { attributes: [] },
};
const messageIncludes = [
	{ model: models.User, as: 'sender', attributes: safeUserAttributes },
	{
		model: models.UploadedFile,
		as: 'attachmentFile',
		attributes: ['id', 'owner_id', 'storage_key', 'mime_type', 'size_bytes'],
	},
	{ model: models.MessageRead, as: 'reads', attributes: ['user_id', 'read_at'] },
];

const getConversation = (conversationId) => models.Conversation.findByPk(conversationId, {
	include: [participantInclude],
});

const getConversationWithMessages = async (conversationId) => {
	const conversation = await getConversation(conversationId);
	if (!conversation) return null;

	conversation.setDataValue('messages', await models.Message.findAll({
		where: { conversation_id: conversationId },
		include: [
			{ model: models.User, as: 'sender', attributes: safeUserAttributes },
			{
				model: models.UploadedFile,
				as: 'attachmentFile',
				attributes: ['id', 'storage_key', 'mime_type', 'size_bytes'],
			},
			{
				model: models.MessageRead,
				as: 'reads',
				attributes: ['user_id', 'read_at'],
				include: [{ model: models.User, as: 'user', attributes: safeUserAttributes }],
			},
		],
		order: [['sent_at', 'ASC'], ['id', 'ASC']],
	}));
	return conversation;
};

const listConversationsForUser = async (userId) => {
	const memberships = await models.ConversationParticipant.findAll({
		where: { user_id: userId },
		attributes: ['conversation_id'],
		raw: true,
	});
	const conversationIds = [...new Set(memberships.map((row) => row.conversation_id))];
	if (conversationIds.length === 0) return [];

	const conversations = await models.Conversation.findAll({
		where: { id: { [Op.in]: conversationIds } },
		include: [
			participantInclude,
			{
				model: models.Message,
				as: 'lastMessage',
				include: [
					{ model: models.User, as: 'sender', attributes: safeUserAttributes },
					{ model: models.UploadedFile, as: 'attachmentFile', attributes: ['id', 'storage_key', 'mime_type', 'size_bytes'] },
				],
			},
		],
		order: [[models.sequelize.literal('"Conversation"."last_message_at" DESC NULLS LAST')], ['created_at', 'DESC']],
	});

	const unreadRows = await models.sequelize.query(
		`SELECT m.conversation_id AS "conversationId", COUNT(*)::int AS "unreadCount"
			 FROM messages m
			 LEFT JOIN message_reads mr
				 ON mr.message_id = m.id AND mr.user_id = :userId
			WHERE m.conversation_id IN (:conversationIds)
				AND m.sender_id <> :userId
				AND mr.id IS NULL
			GROUP BY m.conversation_id`,
		{ replacements: { userId, conversationIds }, type: QueryTypes.SELECT },
	);

	const unreadCounts = new Map(unreadRows.map((row) => [Number(row.conversationId), Number(row.unreadCount)]));
	return conversations.map((conversation) => ({
		conversation,
		unreadCount: unreadCounts.get(conversation.id) || 0,
	}));
};

const getUsersByIds = (ids) => models.User.findAll({
	where: { id: { [Op.in]: ids } },
	attributes: ['id'],
});

const findDirectConversation = async (participantIds, transaction) => {
	const candidates = await models.Conversation.findAll({
		where: { type: 'direct' },
		include: [participantInclude],
		transaction,
	});
	const expected = [...participantIds].sort((left, right) => left - right);

	return candidates.find((conversation) => {
		const actual = conversation.participants.map((participant) => participant.id).sort((left, right) => left - right);
		return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
	}) || null;
};

const createConversation = async ({ userId, participantIds, type }) => {
	const conversationId = await models.sequelize.transaction(async (transaction) => {
		if (type === 'direct') {
			const existing = await findDirectConversation(participantIds, transaction);
			if (existing) return existing.id;
		}

		const now = new Date();
		const conversation = await models.Conversation.create({
			created_by: userId,
			type,
			created_at: now,
			updated_at: now,
		}, { transaction });

		await models.ConversationParticipant.bulkCreate(
			participantIds.map((participantId) => ({ conversation_id: conversation.id, user_id: participantId })),
			{ transaction },
		);
		return conversation.id;
	});

	return getConversationWithMessages(conversationId);
};

const getUploadedFile = (fileId) => models.UploadedFile.findByPk(fileId, {
	attributes: ['id', 'owner_id', 'storage_key', 'mime_type', 'size_bytes'],
});

const createMessage = async ({ conversationId, senderId, content, attachmentFileId }) => {
	const messageId = await models.sequelize.transaction(async (transaction) => {
		const sentAt = new Date();
		const message = await models.Message.create({
			conversation_id: conversationId,
			sender_id: senderId,
			content,
			attachment_file_id: attachmentFileId,
			sent_at: sentAt,
		}, { transaction });

		await models.Conversation.update({
			last_message_id: message.id,
			last_message_at: sentAt,
			updated_at: sentAt,
		}, { where: { id: conversationId }, transaction });
		return message.id;
	});

	return models.Message.findByPk(messageId, { include: messageIncludes });
};

const getMessage = (conversationId, messageId) => models.Message.findOne({
	where: { id: messageId, conversation_id: conversationId },
});

const updateMessage = async ({ conversationId, messageId, userId, content }) => {
	const [updatedCount] = await models.Message.update(
		{ content },
		{ where: { id: messageId, conversation_id: conversationId, sender_id: userId } },
	);
	if (updatedCount === 0) return null;

	return models.Message.findOne({
		where: { id: messageId, conversation_id: conversationId },
		include: messageIncludes,
	});
};

const deleteMessage = async ({ conversationId, messageId, userId }) => models.sequelize.transaction(async (transaction) => {
	const message = await models.Message.findOne({
		where: { id: messageId, conversation_id: conversationId, sender_id: userId },
		transaction,
		lock: transaction.LOCK.UPDATE,
	});
	if (!message) return false;

	await models.MessageRead.destroy({ where: { message_id: messageId }, transaction });
	const deletedCount = await models.Message.destroy({
		where: { id: messageId, conversation_id: conversationId, sender_id: userId },
		transaction,
	});
	if (deletedCount === 0) return false;

	const latestMessage = await models.Message.findOne({
		where: { conversation_id: conversationId },
		attributes: ['id', 'sent_at'],
		order: [['sent_at', 'DESC'], ['id', 'DESC']],
		transaction,
	});
	await models.Conversation.update({
		last_message_id: latestMessage?.id ?? null,
		last_message_at: latestMessage?.sent_at ?? null,
		updated_at: new Date(),
	}, { where: { id: conversationId }, transaction });

	return true;
});

const markConversationRead = async ({ conversationId, userId }) => {
	const messages = await models.Message.findAll({
		where: { conversation_id: conversationId, sender_id: { [Op.ne]: userId } },
		attributes: ['id'],
		include: [{
			model: models.MessageRead,
			as: 'reads',
			attributes: ['id'],
			required: false,
			where: { user_id: userId },
		}],
	});
	const unreadIds = messages.filter((message) => message.reads.length === 0).map((message) => message.id);
	if (unreadIds.length === 0) return 0;

	const reads = await models.MessageRead.bulkCreate(unreadIds.map((messageId) => ({
		message_id: messageId,
		user_id: userId,
		read_at: new Date(),
	})), { ignoreDuplicates: true });
	return reads.length;
};

module.exports = {
	getConversation,
	getConversationWithMessages,
	listConversationsForUser,
	getUsersByIds,
	createConversation,
	getUploadedFile,
	createMessage,
	getMessage,
	updateMessage,
	deleteMessage,
	markConversationRead,
};
