const { sequelize, Op } = require('../models');
const models = require('../models');
const AppError = require('../errors/app-error');

const DOCUMENT_STATUSES = Object.freeze(['pending', 'approved', 'rejected', 'archived']);
const PROCESSING_STATUSES = Object.freeze(['pending', 'processing', 'completed', 'failed']);

function buildVectorLiteral(embedding) {
	if (!Array.isArray(embedding) || embedding.length === 0) {
		throw new AppError('A query embedding vector is required.', 400, 'VALIDATION_ERROR');
	}
	return `[${embedding.map((value) => Number(value)).join(',')}]`;
}

async function createDocument(data, transaction) {
	return models.AIDocument.create(data, { transaction });
}

async function findDocumentById(id, { transaction } = {}) {
	return models.AIDocument.findByPk(id, {
		include: [
			{ model: models.UploadedFile, as: 'file', attributes: ['id', 'original_name', 'mime_type', 'size_bytes'] },
			{ model: models.ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'], required: false },
		],
		transaction,
	});
}

async function listDocuments({ status, category, language, page = 1, limit = 20 } = {}) {
	const where = {};
	if (status) where.status = status;
	if (category) where.category = category;
	if (language) where.language = language;
	const offset = (page - 1) * limit;
	const { rows, count } = await models.AIDocument.findAndCountAll({
		where,
		include: [
			{ model: models.UploadedFile, as: 'file', attributes: ['id', 'original_name', 'mime_type', 'size_bytes'], required: false },
		],
		order: [['created_at', 'DESC']],
		limit,
		offset,
	});
	return { items: rows, total: count, page, limit };
}

async function updateDocument(id, data, transaction) {
	const document = await models.AIDocument.findByPk(id, { transaction });
	if (!document) return null;
	await document.update(data, { transaction });
	return document;
}

async function createDocumentVersion(data, transaction) {
	return models.AIDocumentVersion.create(data, { transaction });
}

async function findLatestVersion(documentId, { transaction } = {}) {
	return models.AIDocumentVersion.findOne({
		where: { document_id: documentId, status: 'active' },
		order: [['version_number', 'DESC']],
		transaction,
	});
}

async function nextVersionNumber(documentId, transaction) {
	const latest = await models.AIDocumentVersion.findOne({
		where: { document_id: documentId },
		order: [['version_number', 'DESC']],
		transaction,
	});
	return (latest?.version_number || 0) + 1;
}

async function deleteChunksForDocument(documentId, transaction) {
	return models.AIDocumentChunk.destroy({ where: { document_id: documentId }, transaction });
}

async function createChunks(chunks, transaction) {
	return models.AIDocumentChunk.bulkCreate(chunks, { transaction });
}

// Inserts chunk rows together with their embeddings using parameterized SQL.
// `embedding` values must be number arrays of the configured dimensionality.
async function createChunksWithEmbeddings(rows, { transaction, sequelizeInstance } = {}) {
	const db = sequelizeInstance || sequelize;
	const created = [];
	for (const row of rows) {
		const chunk = await models.AIDocumentChunk.create({
			document_id: row.document_id,
			document_version_id: row.document_version_id ?? null,
			chunk_index: row.chunk_index,
			content: row.content,
			page_number: row.page_number ?? null,
			section_heading: row.section_heading ?? null,
			token_count: row.token_count ?? null,
			metadata: row.metadata ?? null,
			created_at: new Date(),
		}, { transaction });

		const literal = buildVectorLiteral(row.embedding);
		// Schema-qualified vector type keeps this working regardless of the
		// session search_path (Supabase installs pgvector into `extensions`).
		await db.query(
			'UPDATE ai_document_chunks SET embedding = CAST($1 AS extensions.vector) WHERE id = $2',
			{ bind: [literal, chunk.id], transaction }
		);
		created.push(chunk);
	}
	return created;
}

async function listChunksForDocument(documentId, { limit = 100, offset = 0 } = {}) {
	const { rows, count } = await models.AIDocumentChunk.findAndCountAll({
		where: { document_id: documentId },
		order: [['chunk_index', 'ASC']],
		limit,
		offset,
	});
	return { items: rows, total: count };
}

async function countChunksForDocument(documentId) {
	return models.AIDocumentChunk.count({ where: { document_id: documentId } });
}

// Cosine-distance similarity search over approved, active knowledge chunks.
// Uses the pgvector `<=>` operator. All user-controlled values are bound
// parameters; the vector literal is generated from numeric array values only.
async function searchSimilarChunks({
	queryEmbedding,
	limit = 5,
	language,
	thematicAreaId,
	accessScope = 'all',
	documentId,
	sequelizeInstance,
} = {}) {
	const vectorLiteral = buildVectorLiteral(queryEmbedding);
	const conditions = [
		'd.status = :docStatus',
		'c.embedding IS NOT NULL',
		'd.processing_status = :processingStatus',
		'(d.expiry_date IS NULL OR d.expiry_date >= CURRENT_DATE)',
	];
	const replacements = {
		docStatus: 'approved',
		processingStatus: 'completed',
		vector: vectorLiteral,
		limit: Math.min(Math.max(Number(limit) || 5, 1), 50),
	};
	if (language) {
		conditions.push('(d.language IS NULL OR d.language = :language)');
		replacements.language = language;
	}
	if (thematicAreaId) {
		conditions.push('(d.thematic_area_id IS NULL OR d.thematic_area_id = :thematicAreaId)');
		replacements.thematicAreaId = thematicAreaId;
	}
	if (documentId) {
		conditions.push('d.id = :documentId');
		replacements.documentId = documentId;
	}
	if (accessScope && accessScope !== 'all') {
		conditions.push('(d.access_scope IS NULL OR d.access_scope = :accessScope OR d.access_scope = :allScope)');
		replacements.accessScope = accessScope;
		replacements.allScope = 'all';
	}

	const db = sequelizeInstance || sequelize;
	const [rows] = await db.query(
		`SELECT
			c.id AS chunk_id,
			c.document_id,
			c.document_version_id,
			c.chunk_index,
			c.content,
			c.page_number,
			c.section_heading,
			d.title AS document_title,
			d.document_version,
			d.category,
			d.source_organization,
			d.language,
			d.access_scope,
			(c.embedding OPERATOR(extensions.<=>) CAST(:vector AS extensions.vector)) AS distance
		FROM ai_document_chunks c
		JOIN ai_documents d ON d.id = c.document_id
		WHERE ${conditions.join(' AND ')}
		ORDER BY c.embedding OPERATOR(extensions.<=>) CAST(:vector AS extensions.vector)
		LIMIT :limit`,
		{ replacements }
	);

	return rows.map((row) => ({
		...row,
		score: row.distance != null ? 1 - Number(row.distance) : null,
	}));
}

module.exports = {
	DOCUMENT_STATUSES,
	PROCESSING_STATUSES,
	createDocument,
	findDocumentById,
	listDocuments,
	updateDocument,
	createDocumentVersion,
	findLatestVersion,
	nextVersionNumber,
	deleteChunksForDocument,
	createChunks,
	createChunksWithEmbeddings,
	listChunksForDocument,
	countChunksForDocument,
	searchSimilarChunks,
};
