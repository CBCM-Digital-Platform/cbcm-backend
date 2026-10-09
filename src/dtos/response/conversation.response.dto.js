const messageDto = require('./message.response.dto');

const toConversation = (conversation, unreadCount = 0) => {
	const value = conversation.get ? conversation.get({ plain: true }) : conversation;
	const latest = value.lastMessage || value.messages?.[0];

	return {
		id: value.id,
		type: value.type,
		participants: (value.participants || []).map((participant) => ({
			id: participant.id,
			fullName: participant.full_name,
			role: participant.role,
			avatarUrl: participant.avatar_url,
		})),
		lastMessage: latest ? messageDto.toMessage(latest) : null,
		lastMessageAt: value.last_message_at || latest?.sent_at || null,
		unreadCount: Number(unreadCount) || 0,
		createdAt: value.created_at,
		updatedAt: value.updated_at,
	};
};

const toConversationDetail = (conversation) => {
	const value = conversation.get ? conversation.get({ plain: true }) : conversation;
	return {
		...toConversation(value),
		messages: (value.messages || []).map(messageDto.toMessage),
	};
};

module.exports = { toConversation, toConversationDetail };
