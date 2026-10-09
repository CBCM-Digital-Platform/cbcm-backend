const conversationDto = require('../dtos/response/conversation.response.dto');
const messageDto = require('../dtos/response/message.response.dto');

const toMessage = (message) => messageDto.toMessage(message);

const toConversation = (conversation, unreadCount = 0) => conversationDto.toConversation(conversation, unreadCount);

const toConversationDetail = (conversation) => conversationDto.toConversationDetail(conversation);

module.exports = {
	toMessage,
	toConversation,
	toConversationDetail,
};
