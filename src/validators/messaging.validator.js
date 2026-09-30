const AppError = require('../errors/app-error');

const invalid = (message) => new AppError(message, 400, 'VALIDATION_ERROR');

const parseId = (value, field = 'id') => {
	const id = Number(value);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw invalid(`${field} must be a positive integer.`);
	}
	return id;
};

const parseCreateConversation = (body = {}) => {
	const type = body.type ?? 'direct';
	if (!['direct', 'group'].includes(type)) {
		throw invalid('type must be either direct or group.');
	}
	if (!Array.isArray(body.participantIds) || body.participantIds.length === 0) {
		throw invalid('participantIds must be a non-empty array.');
	}

	const participantIds = body.participantIds.map((id) => parseId(id, 'participantIds item'));
	if (new Set(participantIds).size !== participantIds.length) {
		throw invalid('participantIds cannot contain duplicates.');
	}

	return { participantIds, type };
};

const parseSendMessage = (body = {}) => {
	if (typeof body.content !== 'string' || !body.content.trim()) {
		throw invalid('content is required and cannot be empty.');
	}

	const attachmentFileIds = body.attachmentFileIds ?? [];
	if (!Array.isArray(attachmentFileIds) || attachmentFileIds.length > 1) {
		throw invalid('At most one attachment is supported for a message.');
	}

	const parsedAttachmentIds = attachmentFileIds.map((id) => parseId(id, 'attachmentFileIds item'));
	if (new Set(parsedAttachmentIds).size !== parsedAttachmentIds.length) {
		throw invalid('attachmentFileIds cannot contain duplicates.');
	}

	return { content: body.content.trim(), attachmentFileId: parsedAttachmentIds[0] ?? null };
};

module.exports = { parseId, parseCreateConversation, parseSendMessage };
