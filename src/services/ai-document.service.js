const { sequelize } = require('../models');
const models = require('../models');
const AppError = require('../errors/app-error');
const { hasAnyRole, SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const uploadsService = require('./uploads.service');
const ingestionService = require('./ai-ingestion.service');
const repository = require('../repositories/ai-knowledge.repository');

const requireAdmin = (actor) => {
	if (!hasAnyRole(actor?.role, SYSTEM_ADMIN_ROLES)) {
		throw new AppError('Only administrators can manage AI knowledge documents.', 403, 'FORBIDDEN');
	}
};

const DOCUMENT_CATEGORIES = Object.freeze([
	'clinical_guideline',
	'mentorship_manual',
	'training_manual',
	'competency_framework',
	'assessment_guidance',
	'mentorship_procedure',
	'faq',
	'policy',
	'other',
]);

const EDITABLE_FIELDS = [
	'title', 'description', 'category', 'language', 'source_organization',
	'document_version', 'publication_date', 'review_date', 'expiry_date',
	'thematic_area_id', 'access_scope',
];

function toDocumentResponse(document, extra = {}) {
	if (!document) return null;
	const plain = typeof document.toJSON === 'function' ? document.toJSON() : document;
	return {
		id: plain.id,
		title: plain.title,
		description: plain.description ?? null,
		category: plain.category ?? null,
		language: plain.language ?? 'en',
		sourceOrganization: plain.source_organization ?? null,
		documentVersion: plain.document_version ?? null,
		publicationDate: plain.publication_date ?? null,
		reviewDate: plain.review_date ?? null,
		expiryDate: plain.expiry_date ?? null,
		thematicAreaId: plain.thematic_area_id ?? null,
		accessScope: plain.access_scope ?? 'all',
		status: plain.status,
		processingStatus: plain.processing_status,
		processingError: plain.processing_error ?? null,
		fileId: plain.file_id ?? null,
		uploadedBy: plain.uploaded_by ?? null,
		approvedBy: plain.approved_by ?? null,
		approvedAt: plain.approved_at ?? null,
		file: plain.file ? {
			id: plain.file.id,
			originalName: plain.file.original_name,
			mimeType: plain.file.mime_type,
			sizeBytes: plain.file.size_bytes,
		} : null,
		thematicArea: plain.thematicArea ? {
			id: plain.thematicArea.id,
			code: plain.thematicArea.code,
			name: plain.thematicArea.name,
		} : null,
		createdAt: plain.created_at,
		updatedAt: plain.updated_at,
		...extra,
	};
}

async function uploadDocument({ actor, upload, metadata = {} }) {
	requireAdmin(actor);
	if (!upload?.body) {
		throw new AppError('A PDF or DOCX file is required.', 400, 'FILE_REQUIRED');
	}
	const stored = await uploadsService.createUpload({
		actor,
		upload,
		context: 'ai-knowledge',
	});

	try {
		const document = await sequelize.transaction(async (transaction) => {
			const doc = await repository.createDocument({
				title: metadata.title,
				description: metadata.description ?? null,
				category: metadata.category ?? null,
				language: metadata.language || 'en',
				source_organization: metadata.source_organization ?? metadata.sourceOrganization ?? null,
				document_version: metadata.document_version ?? metadata.documentVersion ?? null,
				publication_date: metadata.publication_date ?? metadata.publicationDate ?? null,
				review_date: metadata.review_date ?? metadata.reviewDate ?? null,
				expiry_date: metadata.expiry_date ?? metadata.expiryDate ?? null,
				thematic_area_id: metadata.thematic_area_id ?? metadata.thematicAreaId ?? null,
				access_scope: metadata.access_scope ?? metadata.accessScope ?? 'all',
				status: 'pending',
				processing_status: 'pending',
				file_id: stored.id,
				uploaded_by: actor.id,
				created_at: new Date(),
				updated_at: new Date(),
			}, transaction);
			await repository.createDocumentVersion({
				document_id: doc.id,
				version_number: 1,
				file_id: stored.id,
				status: 'active',
				created_by: actor.id,
				created_at: new Date(),
			}, transaction);
			return doc;
		});
		return toDocumentResponse(document);
	} catch (error) {
		await uploadsService.deleteUpload(stored.id, actor).catch(() => {});
		throw error;
	}
}

async function listDocuments(query = {}) {
	requireAdmin(query.actor);
	const result = await repository.listDocuments({
		status: query.status,
		category: query.category,
		language: query.language,
		page: Number(query.page) || 1,
		limit: Math.min(Number(query.limit) || 20, 100),
	});
	return {
		items: result.items.map((doc) => toDocumentResponse(doc)),
		total: result.total,
		page: result.page,
		limit: result.limit,
	};
}

async function getDocument(id, actor) {
	requireAdmin(actor);
	const document = await repository.findDocumentById(id);
	if (!document) throw new AppError('Knowledge document not found.', 404, 'NOT_FOUND');
	return toDocumentResponse(document);
}

async function updateDocument(id, body, actor) {
	requireAdmin(actor);
	const data = {};
	for (const field of EDITABLE_FIELDS) {
		const snake = field;
		const camel = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
		if (body[snake] !== undefined) data[snake] = body[snake];
		else if (body[camel] !== undefined) data[snake] = body[camel];
	}
	if (data.category && !DOCUMENT_CATEGORIES.includes(String(data.category))) {
		throw new AppError(`category must be one of: ${DOCUMENT_CATEGORIES.join(', ')}.`, 400, 'VALIDATION_ERROR');
	}
	if (data.access_scope && !['all', 'mentors', 'mentees', 'facility_admins'].includes(String(data.access_scope))) {
		throw new AppError('access_scope must be one of: all, mentors, mentees, facility_admins.', 400, 'VALIDATION_ERROR');
	}
	const document = await repository.updateDocument(id, { ...data, updated_at: new Date() });
	if (!document) throw new AppError('Knowledge document not found.', 404, 'NOT_FOUND');
	return toDocumentResponse(await repository.findDocumentById(id));
}

async function transitionStatus(id, targetStatus, actor) {
	requireAdmin(actor);
	const allowed = {
		approved: ['pending', 'rejected'],
		rejected: ['pending', 'approved'],
		archived: ['pending', 'approved', 'rejected'],
	};
	const document = await repository.findDocumentById(id);
	if (!document) throw new AppError('Knowledge document not found.', 404, 'NOT_FOUND');
	if (!allowed[targetStatus]?.includes(document.status)) {
		throw new AppError(`Cannot move a ${document.status} document to ${targetStatus}.`, 409, 'INVALID_STATUS_TRANSITION');
	}
	const data = { status: targetStatus, updated_at: new Date() };
	if (targetStatus === 'approved') {
		data.approved_by = actor.id;
		data.approved_at = new Date();
		data.processing_status = 'pending';
	} else if (targetStatus === 'archived') {
		data.processing_status = 'pending';
	}
	const updated = await repository.updateDocument(id, data);
	return toDocumentResponse(updated);
}

async function ingestDocument(id, actor) {
	requireAdmin(actor);
	const document = await repository.findDocumentById(id);
	if (!document) throw new AppError('Knowledge document not found.', 404, 'NOT_FOUND');
	if (document.status !== 'approved') {
		throw new AppError('Only approved documents can be ingested.', 409, 'DOCUMENT_NOT_APPROVED');
	}
	const result = await ingestionService.ingestDocument(id);
	return {
		document: toDocumentResponse(result.document),
		chunksCreated: result.chunksCreated,
	};
}

async function listChunks(id, actor, { page = 1, limit = 50 } = {}) {
	requireAdmin(actor);
	const document = await repository.findDocumentById(id);
	if (!document) throw new AppError('Knowledge document not found.', 404, 'NOT_FOUND');
	const result = await repository.listChunksForDocument(id, {
		limit: Math.min(limit, 200),
		offset: (page - 1) * limit,
	});
	return {
		items: result.items.map((chunk) => ({
			id: chunk.id,
			documentId: chunk.document_id,
			documentVersionId: chunk.document_version_id,
			chunkIndex: chunk.chunk_index,
			content: chunk.content,
			pageNumber: chunk.page_number,
			sectionHeading: chunk.section_heading,
			tokenCount: chunk.token_count,
			createdAt: chunk.created_at,
		})),
		total: result.total,
	};
}

module.exports = {
	DOCUMENT_CATEGORIES,
	toDocumentResponse,
	uploadDocument,
	listDocuments,
	getDocument,
	updateDocument,
	transitionStatus,
	ingestDocument,
	listChunks,
};
