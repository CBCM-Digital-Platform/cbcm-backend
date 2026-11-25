const express = require('express');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { SYSTEM_ADMIN_ROLES, FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');
const { aiDocumentUpload, inspectAiDocumentUpload, mapMulterError } = require('../config/multer');
const { createRateLimiter } = require('../middlewares/rate-limiter.middleware');
const controller = require('../controllers/ai-assistant.controller');
const {
	parseConversationCreate,
	parseMessageCreate,
	parseFeedback,
	parseDocumentMetadata,
	parseSearchQuery,
	parseId,
} = require('../validators/ai-assistant.validator');

const router = express.Router();

const aiUserRateLimit = createRateLimiter({ windowMs: 60000, max: 20 });
const aiChatRateLimit = createRateLimiter({ windowMs: 60000, max: 10 });

const parseBody = (parser) => (req, res, next) => {
	try {
		req.aiParsed = parser(req.body || {});
		return next();
	} catch (error) {
		return next(error);
	}
};

function uploadAiDocument(req, res, next) {
	aiDocumentUpload.single('file')(req, res, (error) => {
		if (error) return next(mapMulterError(error));
		try {
			req.aiDocumentUpload = inspectAiDocumentUpload(req.file);
			req.aiDocumentMetadata = parseDocumentMetadata(req.body || {});
			return next();
		} catch (validationError) {
			return next(validationError);
		}
	});
}

router.use(authenticate);

/**
 * @openapi
 * /api/v1/ai/status:
 *   get:
 *     summary: AI assistant status
 *     description: Returns whether the Gemini provider is configured and safe, non-secret configuration details. Available to all authenticated CBCM roles.
 *     tags: [AI Assistant]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: AI configuration status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     configured: { type: boolean }
 *                     model: { type: string }
 *                     embeddingModel: { type: string }
 *                     embeddingDimensions: { type: integer }
 *                     privacyGate:
 *                       type: object
 *                       properties:
 *                         userContextSharing: { type: boolean }
 *       401:
 *         description: Authentication required
 */
router.get('/status', controller.status);

/**
 * @openapi
 * /api/v1/ai/conversations:
 *   post:
 *     summary: Create an AI conversation
 *     description: Starts a new persistent AI mentorship assistant conversation for the authenticated user.
 *     tags: [AI Assistant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string, maxLength: 200 }
 *     responses:
 *       201:
 *         description: Conversation created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     id: { type: integer }
 *                     title: { type: string, nullable: true }
 *                     status: { type: string }
 *                     createdAt: { type: string, format: date-time }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Role not permitted
 */
router.post('/conversations', parseBody(parseConversationCreate), (req, res, next) => {
	req.body = { ...(req.body || {}), ...(req.aiParsed || {}) };
	next();
}, controller.createConversation);

/**
 * @openapi
 * /api/v1/ai/conversations:
 *   get:
 *     summary: List AI conversations
 *     description: Lists the authenticated user's own AI conversations with pagination.
 *     tags: [AI Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, archived] }
 *     responses:
 *       200:
 *         description: Paginated conversations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       title: { type: string, nullable: true }
 *                       status: { type: string }
 *                       lastMessageAt: { type: string, format: date-time, nullable: true }
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *       401:
 *         description: Authentication required
 */
router.get('/conversations', controller.listConversations);

/**
 * @openapi
 * /api/v1/ai/conversations/{id}:
 *   get:
 *     summary: Get an AI conversation
 *     description: Retrieves a single conversation owned by the authenticated user.
 *     tags: [AI Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Conversation details
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Conversation not found
 */
router.get('/conversations/:id', controller.validateParamId, controller.getConversation);

/**
 * @openapi
 * /api/v1/ai/conversations/{id}/messages:
 *   get:
 *     summary: List conversation messages
 *     description: Returns the message history of an owned conversation, including persisted citations on assistant messages.
 *     tags: [AI Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 100 }
 *       - in: query
 *         name: before_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ordered list of messages
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Conversation not found
 */
router.get('/conversations/:id/messages', controller.validateParamId, controller.listMessages);

/**
 * @openapi
 * /api/v1/ai/conversations/{id}:
 *   delete:
 *     summary: Archive an AI conversation
 *     description: Archives (soft-deletes) a conversation owned by the authenticated user.
 *     tags: [AI Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Conversation archived
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Conversation not found
 */
router.delete('/conversations/:id', controller.validateParamId, controller.archiveConversation);

/**
 * @openapi
 * /api/v1/ai/conversations/{id}/messages:
 *   post:
 *     summary: Send a message to the AI assistant
 *     description: >-
 *       Sends a question and receives a RAG-grounded answer generated by Gemini
 *       from approved CBCM knowledge documents. The response includes citations
 *       referencing the actual retrieved document chunks. Rate limited.
 *     tags: [AI Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *                 maxLength: 4000
 *                 example: Explain the principles of infection prevention and control.
 *     responses:
 *       200:
 *         description: Assistant reply with citations and usage metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId: { type: integer }
 *                     userMessageId: { type: integer }
 *                     assistantMessage:
 *                       type: object
 *                       properties:
 *                         id: { type: integer }
 *                         role: { type: string }
 *                         content: { type: string }
 *                         model: { type: string }
 *                         citations:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               source: { type: string }
 *                               excerpt: { type: string }
 *                               documentId: { type: integer }
 *                               chunkId: { type: integer }
 *                               pageNumber: { type: integer, nullable: true }
 *                               sectionHeading: { type: string, nullable: true }
 *                         sources:
 *                           type: array
 *                           items: { type: object }
 *                         safetyNotice: { type: boolean }
 *                         createdAt: { type: string, format: date-time }
 *                     sources:
 *                       type: array
 *                       items: { type: object }
 *                     usage:
 *                       type: object
 *                       properties:
 *                         model: { type: string }
 *                         prompt_tokens: { type: integer, nullable: true }
 *                         completion_tokens: { type: integer, nullable: true }
 *                         total_tokens: { type: integer, nullable: true }
 *                         latencyMs: { type: integer }
 *                         retrievedChunks: { type: integer }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Conversation not found
 *       409:
 *         description: Conversation archived
 *       429:
 *         description: Rate limited
 *       503:
 *         description: AI assistant not configured
 */
router.post('/conversations/:id/messages', controller.validateParamId, aiChatRateLimit, parseBody(parseMessageCreate), controller.sendMessage);

/**
 * @openapi
 * /api/v1/ai/messages/{messageId}/feedback:
 *   post:
 *     summary: Submit feedback on an assistant message
 *     description: Records thumbs up/down feedback on an AI assistant message owned by the user. One feedback record per user per message; resubmitting updates it.
 *     tags: [AI Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: messageId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [rating]
 *             properties:
 *               rating:
 *                 type: string
 *                 enum: [up, down]
 *               comment:
 *                 type: string
 *                 maxLength: 1000
 *     responses:
 *       200:
 *         description: Feedback recorded
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Not the message owner or not an assistant message
 *       404:
 *         description: Message not found
 */
router.post('/messages/:messageId/feedback', (req, res, next) => {
	try {
		req.params.messageId = String(parseId(req.params.messageId, 'messageId'));
		req.aiParsed = parseFeedback(req.body || {});
		return next();
	} catch (error) {
		return next(error);
	}
}, (req, res, next) => {
	req.body = { ...(req.body || {}), ...(req.aiParsed || {}) };
	next();
}, controller.submitFeedback);

/**
 * @openapi
 * /api/v1/ai/knowledge/documents:
 *   post:
 *     summary: Upload a knowledge document
 *     description: >-
 *       Uploads a PDF or DOCX knowledge document as a pending document. The
 *       file is validated by MIME type and content signature, stored via the
 *       existing upload infrastructure, and is NOT used by the assistant until
 *       an administrator approves it and ingestion completes. Admin only.
 *     tags: [AI Knowledge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: PDF or DOCX file
 *               title: { type: string, maxLength: 255 }
 *               description: { type: string, maxLength: 5000 }
 *               category:
 *                 type: string
 *                 enum: [clinical_guideline, mentorship_manual, training_manual, competency_framework, assessment_guidance, mentorship_procedure, faq, policy, other]
 *               language: { type: string, example: en }
 *               source_organization: { type: string, example: "Federal Ministry of Health" }
 *               document_version: { type: string, example: "2024.1" }
 *               publication_date: { type: string, format: date }
 *               review_date: { type: string, format: date }
 *               expiry_date: { type: string, format: date }
 *               thematic_area_id: { type: integer }
 *               access_scope:
 *                 type: string
 *                 enum: [all, mentors, mentees, facility_admins]
 *     responses:
 *       201:
 *         description: Document created in pending status
 *       400:
 *         description: Invalid file or metadata
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 */
router.post(
	'/knowledge/documents',
	requireRole(SYSTEM_ADMIN_ROLES),
	uploadAiDocument,
	controller.uploadDocument
);

/**
 * @openapi
 * /api/v1/ai/knowledge/documents:
 *   get:
 *     summary: List knowledge documents
 *     description: Paginated list of AI knowledge documents with optional filters. Admin only.
 *     tags: [AI Knowledge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, approved, rejected, archived] }
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: language
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated documents
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 */
router.get('/knowledge/documents', requireRole(SYSTEM_ADMIN_ROLES), controller.listDocuments);

/**
 * @openapi
 * /api/v1/ai/knowledge/documents/{id}:
 *   get:
 *     summary: Get a knowledge document
 *     description: Returns document metadata, file info, approval state, and ingestion status. Admin only.
 *     tags: [AI Knowledge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Document details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Document not found
 */
router.get('/knowledge/documents/:id', requireRole(SYSTEM_ADMIN_ROLES), controller.validateParamId, controller.getDocument);

/**
 * @openapi
 * /api/v1/ai/knowledge/documents/{id}:
 *   patch:
 *     summary: Update knowledge document metadata
 *     description: Updates editable metadata fields (title, description, category, dates, thematic area, access scope). Admin only.
 *     tags: [AI Knowledge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               category: { type: string }
 *               language: { type: string }
 *               source_organization: { type: string }
 *               document_version: { type: string }
 *               publication_date: { type: string, format: date }
 *               review_date: { type: string, format: date }
 *               expiry_date: { type: string, format: date }
 *               thematic_area_id: { type: integer }
 *               access_scope: { type: string, enum: [all, mentors, mentees, facility_admins] }
 *     responses:
 *       200:
 *         description: Updated document
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Document not found
 */
router.patch('/knowledge/documents/:id', requireRole(SYSTEM_ADMIN_ROLES), controller.validateParamId, controller.updateDocument);

/**
 * @openapi
 * /api/v1/ai/knowledge/documents/{id}/approve:
 *   post:
 *     summary: Approve a knowledge document
 *     description: Moves a pending or rejected document to approved status and records the approving admin. Approved documents become eligible for ingestion and RAG retrieval once indexed. Admin only.
 *     tags: [AI Knowledge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Document approved
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Document not found
 *       409:
 *         description: Invalid status transition
 */
router.post('/knowledge/documents/:id/approve', requireRole(SYSTEM_ADMIN_ROLES), controller.validateParamId, controller.approveDocument);

/**
 * @openapi
 * /api/v1/ai/knowledge/documents/{id}/reject:
 *   post:
 *     summary: Reject a knowledge document
 *     description: Moves a pending or approved document to rejected status so it is excluded from retrieval. Admin only.
 *     tags: [AI Knowledge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Document rejected
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Document not found
 *       409:
 *         description: Invalid status transition
 */
router.post('/knowledge/documents/:id/reject', requireRole(SYSTEM_ADMIN_ROLES), controller.validateParamId, controller.rejectDocument);

/**
 * @openapi
 * /api/v1/ai/knowledge/documents/{id}/archive:
 *   post:
 *     summary: Archive a knowledge document
 *     description: Archives a document, removing it from active retrieval. Admin only.
 *     tags: [AI Knowledge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Document archived
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Document not found
 *       409:
 *         description: Invalid status transition
 */
router.post('/knowledge/documents/:id/archive', requireRole(SYSTEM_ADMIN_ROLES), controller.validateParamId, controller.archiveDocument);

/**
 * @openapi
 * /api/v1/ai/knowledge/documents/{id}/ingest:
 *   post:
 *     summary: Trigger document ingestion
 *     description: >-
 *       Runs the ingestion pipeline for an approved document: text extraction
 *       (PDF via pdf-parse, DOCX via mammoth), chunking, embedding generation
 *       with the configured Gemini embedding model, and pgvector storage.
 *       Re-ingestion replaces existing chunks. Admin only.
 *     tags: [AI Knowledge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Ingestion completed with chunk count
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Document not found
 *       409:
 *         description: Document is not approved
 *       422:
 *         description: Text extraction produced no usable content
 *       503:
 *         description: AI provider not configured
 */
router.post('/knowledge/documents/:id/ingest', requireRole(SYSTEM_ADMIN_ROLES), controller.validateParamId, aiUserRateLimit, controller.ingestDocument);

/**
 * @openapi
 * /api/v1/ai/knowledge/documents/{id}/chunks:
 *   get:
 *     summary: List indexed chunks for a document
 *     description: Returns stored content chunks (without vectors) for diagnostics. Admin only.
 *     tags: [AI Knowledge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 200, default: 50 }
 *     responses:
 *       200:
 *         description: Paginated chunks
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Document not found
 */
router.get('/knowledge/documents/:id/chunks', requireRole(SYSTEM_ADMIN_ROLES), controller.validateParamId, controller.listDocumentChunks);

/**
 * @openapi
 * /api/v1/ai/knowledge/search:
 *   post:
 *     summary: Diagnostic knowledge search
 *     description: >-
 *       Runs the same embedding + pgvector retrieval pipeline used by chat and
 *       returns the matching approved chunks with similarity scores. For
 *       verifying ingestion and retrieval quality. Admin and facility admin
 *       only. Rate limited.
 *     tags: [AI Knowledge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [query]
 *             properties:
 *               query: { type: string, maxLength: 2000 }
 *               limit: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *               language: { type: string }
 *               thematic_area_id: { type: integer }
 *               document_id: { type: integer }
 *     responses:
 *       200:
 *         description: Retrieved chunks ranked by cosine similarity
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       429:
 *         description: Rate limited
 *       503:
 *         description: AI provider not configured
 */
router.post(
	'/knowledge/search',
	requireRole(FACILITY_MANAGEMENT_ROLES),
	aiUserRateLimit,
	parseBody(parseSearchQuery),
	(req, res, next) => {
		req.body = { ...(req.body || {}), ...(req.aiParsed || {}) };
		req.aiSearch = req.aiParsed;
		next();
	},
	controller.searchKnowledge
);

/**
 * @openapi
 * /api/v1/ai/usage:
 *   get:
 *     summary: AI usage statistics
 *     description: Returns recent AI usage log entries and token totals for monitoring. Admin and facility admin only.
 *     tags: [AI Assistant]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: end_date
 *         schema: { type: string, format: date }
 *     responses:
 *       200:
 *         description: Usage summary with totals
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 */
router.get('/usage', requireRole(FACILITY_MANAGEMENT_ROLES), controller.usage);

module.exports = router;
