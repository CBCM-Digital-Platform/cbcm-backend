const assistantService = require('../services/ai-assistant.service');
const chatService = require('../services/ai-chat.service');
const documentService = require('../services/ai-document.service');
const { getRagRetriever } = require('../providers/rag-retriever.provider');
const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');
const { parseId } = require('../validators/ai-assistant.validator');

const FALLBACK = 'Unable to complete the AI assistant request.';

const validateParamId = (req, res, next, param = 'id') => {
	try {
		req.params[param] = String(parseId(req.params[param], param));
		return next();
	} catch (error) {
		return next(error);
	}
};

// ---------- Status ----------

async function status(req, res) {
	try {
		const data = await assistantService.getStatus();
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

// ---------- Conversations ----------

async function createConversation(req, res) {
	try {
		const data = await assistantService.createConversation({ user: req.user, title: req.body?.title });
		return successResponse(res, 201, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function listConversations(req, res) {
	try {
		const result = await assistantService.listConversations({
			user: req.user,
			page: req.query.page,
			limit: req.query.limit,
			status: req.query.status,
		});
		return successResponse(res, 200, result.items, {
			page: result.page,
			limit: result.limit,
			total: result.total,
		});
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function getConversation(req, res) {
	try {
		const data = await assistantService.getConversation({ user: req.user, id: req.params.id });
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function listMessages(req, res) {
	try {
		const data = await assistantService.listMessages({
			user: req.user,
			conversationId: req.params.id,
			limit: req.query.limit,
			beforeId: req.query.before_id ?? req.query.beforeId,
		});
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function archiveConversation(req, res) {
	try {
		const data = await assistantService.archiveConversation({ user: req.user, id: req.params.id });
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

// ---------- Chat ----------

async function sendMessage(req, res) {
	try {
		const data = await chatService.sendMessage({
			user: req.user,
			conversationId: req.params.id,
			content: req.body?.content,
		});
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

// ---------- Feedback ----------

async function submitFeedback(req, res) {
	try {
		const data = await assistantService.submitFeedback({
			user: req.user,
			messageId: req.params.messageId,
			rating: req.body?.rating,
			comment: req.body?.comment,
		});
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

// ---------- Knowledge documents ----------

async function uploadDocument(req, res) {
	try {
		const data = await documentService.uploadDocument({
			actor: req.user,
			upload: req.aiDocumentUpload,
			metadata: req.aiDocumentMetadata || {},
		});
		return successResponse(res, 201, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function listDocuments(req, res) {
	try {
		const result = await documentService.listDocuments({ ...req.query, actor: req.user });
		return successResponse(res, 200, result.items, {
			page: result.page,
			limit: result.limit,
			total: result.total,
		});
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function getDocument(req, res) {
	try {
		const data = await documentService.getDocument(Number(req.params.id), req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function updateDocument(req, res) {
	try {
		const data = await documentService.updateDocument(Number(req.params.id), req.body || {}, req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function approveDocument(req, res) {
	try {
		const data = await documentService.transitionStatus(Number(req.params.id), 'approved', req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function rejectDocument(req, res) {
	try {
		const data = await documentService.transitionStatus(Number(req.params.id), 'rejected', req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function archiveDocument(req, res) {
	try {
		const data = await documentService.transitionStatus(Number(req.params.id), 'archived', req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function ingestDocument(req, res) {
	try {
		const data = await documentService.ingestDocument(Number(req.params.id), req.user);
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

async function listDocumentChunks(req, res) {
	try {
		const data = await documentService.listChunks(Number(req.params.id), req.user, {
			page: Number(req.query.page) || 1,
			limit: Number(req.query.limit) || 50,
		});
		return successResponse(res, 200, data.items, { total: data.total });
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

// ---------- RAG diagnostics ----------

async function searchKnowledge(req, res) {
	try {
		const retriever = getRagRetriever();
		const chunks = await retriever.retrieveForDiagnostics({
			query: req.aiSearch.query,
			limit: req.aiSearch.limit,
			filters: {
				language: req.aiSearch.language,
				thematicAreaId: req.aiSearch.thematicAreaId,
				documentId: req.aiSearch.documentId,
			},
		});
		return successResponse(res, 200, chunks.map((chunk) => ({
			chunkId: chunk.chunk_id,
			documentId: chunk.document_id,
			documentVersionId: chunk.document_version_id,
			documentTitle: chunk.document_title,
			documentVersion: chunk.document_version,
			chunkIndex: chunk.chunk_index,
			content: chunk.content,
			pageNumber: chunk.page_number,
			sectionHeading: chunk.section_heading,
			score: chunk.score,
			distance: chunk.distance,
		})));
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

// ---------- Usage ----------

async function usage(req, res) {
	try {
		const data = await assistantService.getUsage({
			actor: req.user,
			startDate: req.query.start_date ?? req.query.startDate,
			endDate: req.query.end_date ?? req.query.endDate,
		});
		return successResponse(res, 200, data);
	} catch (error) {
		return controllerError(res, error, FALLBACK);
	}
}

module.exports = {
	validateParamId,
	status,
	createConversation,
	listConversations,
	getConversation,
	listMessages,
	archiveConversation,
	sendMessage,
	submitFeedback,
	uploadDocument,
	listDocuments,
	getDocument,
	updateDocument,
	approveDocument,
	rejectDocument,
	archiveDocument,
	ingestDocument,
	listDocumentChunks,
	searchKnowledge,
	usage,
};
