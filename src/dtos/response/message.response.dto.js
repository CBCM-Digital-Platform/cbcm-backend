const toMessage = (message) => {
	const value = message.get ? message.get({ plain: true }) : message;
	const sender = value.sender;
	const attachment = value.attachmentFile;

	return {
		id: value.id,
		conversationId: value.conversation_id,
		senderId: value.sender_id,
		content: value.content,
		sentAt: value.sent_at,
		sender: sender ? {
			id: sender.id,
			fullName: sender.full_name,
			role: sender.role,
			avatarUrl: sender.avatar_url,
		} : null,
		attachment: attachment ? {
			id: attachment.id,
			storageKey: attachment.storage_key,
			mimeType: attachment.mime_type,
			sizeBytes: attachment.size_bytes,
		} : null,
		reads: (value.reads || []).map((read) => ({ userId: read.user_id, readAt: read.read_at })),
	};
};

module.exports = { toMessage };
