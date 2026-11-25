const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { sequelize } = require('../models');
const models = require('../models');
const AppError = require('../errors/app-error');
const storage = require('../providers/storage.provider');
const { getLlmProvider } = require('../providers/llm.provider');
const repository = require('../repositories/ai-knowledge.repository');
const { chunkText } = require('../utils/text-chunker.util');

const EMBEDDING_BATCH_SIZE = 32;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

async function streamToBuffer(stream) {
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return Buffer.concat(chunks);
}

async function extractTextFromBuffer({ buffer, mimeType }) {
	if (mimeType === 'application/pdf') {
		const result = await pdfParse(buffer);
		return String(result?.text || '');
	}
	if (mimeType === DOCX_MIME) {
		const result = await mammoth.extractRawText({ buffer });
		return String(result?.value || '');
	}
	throw new AppError(`Unsupported knowledge document type: ${mimeType}.`, 400, 'FILE_TYPE_UNSUPPORTED');
}

async function loadDocumentFileBuffer(fileId) {
	const file = await models.UploadedFile.findByPk(fileId);
	if (!file) {
		throw new AppError('The document file was not found.', 404, 'FILE_NOT_FOUND');
	}
	const opened = await storage.getStorageProvider().open(file.storage_key);
	const buffer = await streamToBuffer(opened.stream);
	return { buffer, mimeType: file.mime_type, file };
}

async function embedChunks(llm, document, chunks) {
	const embeddings = [];
	for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
		const batch = chunks.slice(i, i + EMBEDDING_BATCH_SIZE);
		const result = await llm.embedContent({
			contents: batch.map((chunk) => ({
				title: document.title,
				text: chunk.content,
			})),
			taskType: 'RETRIEVAL_DOCUMENT',
		});
		embeddings.push(...result.embeddings);
	}
	return embeddings;
}

/**
 * Ingests an approved document: extracts text, chunks it, embeds every chunk,
 * and stores chunks + vectors. Re-ingestion replaces existing chunks for the
 * document so duplicates cannot accumulate. Any failure is recorded on the
 * document's processing_status/processing_error — never silently marked done.
 */
async function ingestDocument(documentId, { llm } = {}) {
	const provider = llm || getLlmProvider();
	const document = await repository.findDocumentById(documentId);
	if (!document) {
		throw new AppError('Knowledge document not found.', 404, 'NOT_FOUND');
	}
	if (document.status !== 'approved') {
		throw new AppError('Only approved documents can be ingested.', 409, 'DOCUMENT_NOT_APPROVED');
	}

	const fileId = document.file_id;
	if (!fileId) {
		await repository.updateDocument(documentId, {
			processing_status: 'failed',
			processing_error: 'The document has no associated file.',
		});
		throw new AppError('The document has no associated file.', 400, 'VALIDATION_ERROR');
	}

	await repository.updateDocument(documentId, {
		processing_status: 'processing',
		processing_error: null,
	});

	try {
		const { buffer, mimeType } = await loadDocumentFileBuffer(fileId);
		const text = await extractTextFromBuffer({ buffer, mimeType });
		if (!text || !text.trim()) {
			throw new AppError('No readable text could be extracted from the document.', 422, 'EXTRACTION_EMPTY');
		}

		const chunks = chunkText(text);
		if (!chunks.length) {
			throw new AppError('The document produced no usable content chunks.', 422, 'EXTRACTION_EMPTY');
		}

		const embeddings = await embedChunks(provider, document, chunks);

		const version = await repository.findLatestVersion(documentId);
		await sequelize.transaction(async (transaction) => {
			await repository.deleteChunksForDocument(documentId, transaction);
			await repository.createChunksWithEmbeddings(
				chunks.map((chunk, index) => ({
					document_id: documentId,
					document_version_id: version?.id ?? null,
					chunk_index: chunk.chunkIndex ?? index,
					content: chunk.content,
					page_number: chunk.pageNumber ?? null,
					section_heading: chunk.sectionHeading ?? null,
					token_count: chunk.content.split(/\s+/).length,
					metadata: { extraction: mimeType === 'application/pdf' ? 'pdf-parse' : 'mammoth' },
					embedding: embeddings[index],
				})),
				{ transaction }
			);
		});

		const updated = await repository.updateDocument(documentId, {
			processing_status: 'completed',
			processing_error: null,
		});
		return {
			document: updated,
			chunksCreated: chunks.length,
		};
	} catch (error) {
		const message = error instanceof AppError ? error.message : (error?.message || 'Ingestion failed.');
		await repository.updateDocument(documentId, {
			processing_status: 'failed',
			processing_error: String(message).slice(0, 2000),
		}).catch(() => {});
		throw error instanceof AppError ? error : new AppError(`Document ingestion failed: ${message}`, 500, 'INGESTION_FAILED');
	}
}

module.exports = {
	ingestDocument,
	extractTextFromBuffer,
	loadDocumentFileBuffer,
	DOCX_MIME,
};
