const service = require('../services/messaging.service');
const conversationDto = require('../dtos/response/conversation.response.dto');
const messageDto = require('../dtos/response/message.response.dto');

const asyncHandler = (handler) => (req, res, next) => {
	Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = {
	listContacts: asyncHandler(async (req, res) => {
		const contacts = await service.listContacts(req.user.id, req.user.role, req.messagingInput.q);
		return res.json({ success: true, data: contacts });
	}),
	listConversations: asyncHandler(async (req, res) => {
		const records = await service.listConversations(req.user.id);
		return res.json({
			success: true,
			data: records.map(({ conversation, unreadCount }) => conversationDto.toConversation(conversation, unreadCount)),
		});
	}),
	getConversation: asyncHandler(async (req, res) => {
		const conversation = await service.getConversation(req.params.id, req.user.id);
		return res.json({ success: true, data: conversationDto.toConversationDetail(conversation) });
	}),
	createConversation: asyncHandler(async (req, res) => {
		const conversation = await service.createConversation({ ...req.messagingInput, userId: req.user.id });
		return res.status(201).json({ success: true, data: conversationDto.toConversationDetail(conversation) });
	}),
	sendMessage: asyncHandler(async (req, res) => {
		const message = await service.sendMessage({
			...req.messagingInput,
			conversationId: req.params.id,
			userId: req.user.id,
		});
		return res.status(201).json({ success: true, data: messageDto.toMessage(message) });
	}),
	editMessage: asyncHandler(async (req, res) => {
		const message = await service.editMessage({
			...req.messagingInput,
			conversationId: req.params.id,
			messageId: req.params.messageId,
			userId: req.user.id,
		});
		return res.json({ success: true, data: messageDto.toMessage(message) });
	}),
	deleteMessage: asyncHandler(async (req, res) => {
		await service.deleteMessage({
			conversationId: req.params.id,
			messageId: req.params.messageId,
			userId: req.user.id,
		});
		return res.json({ success: true, data: { deleted: true } });
	}),
	markRead: asyncHandler(async (req, res) => {
		const result = await service.markRead({ conversationId: req.params.id, userId: req.user.id });
		return res.json({ success: true, data: result });
	}),
};
