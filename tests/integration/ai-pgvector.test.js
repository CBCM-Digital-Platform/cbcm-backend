// PostgreSQL + pgvector integration test for the AI knowledge retrieval layer.
//
// This test requires a real PostgreSQL database with the pgvector extension and
// the AI migration applied. It is skipped unless AI_PG_TEST=true is set:
//
//   AI_PG_TEST=true DATABASE_URL=postgres://... node --test tests/integration/ai-pgvector.test.js
//
// It inserts synthetic chunks (no real documents or user data), verifies cosine
// similarity retrieval, approval filtering, and access-scope filtering, then
// removes its fixtures.

require('dotenv').config();
const test = require('node:test');
const assert = require('node:assert/strict');

const ENABLED = process.env.AI_PG_TEST === 'true' || process.env.AI_PG_TEST === '1';

test('pgvector similarity retrieval, approval and access-scope filters', { skip: !ENABLED }, async (t) => {
	const { Sequelize } = require('sequelize');
	const pg = new Sequelize(process.env.DATABASE_URL, {
		dialect: 'postgres',
		logging: false,
		dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
	});
	const repository = require('../../src/repositories/ai-knowledge.repository');

	const suffix = Date.now();
	let documentId;
	let pendingDocumentId;
	let restrictedDocumentId;
	let versionId;
	let chunkIds = [];

	try {
		await pg.authenticate();

		// Fixture documents: one approved, one pending (must be excluded).
		const [doc] = await pg.query(
			`INSERT INTO ai_documents (title, status, processing_status, access_scope, language, created_at, updated_at)
			 VALUES ($1, 'approved', 'completed', 'all', 'en', NOW(), NOW()) RETURNING id`,
			{ bind: [`pgvector-test-doc-${suffix}`] }
		);
		documentId = doc[0].id;
		const [pendingDoc] = await pg.query(
			`INSERT INTO ai_documents (title, status, processing_status, access_scope, language, created_at, updated_at)
			 VALUES ($1, 'pending', 'pending', 'all', 'en', NOW(), NOW()) RETURNING id`,
			{ bind: [`pgvector-test-pending-${suffix}`] }
		);
		pendingDocumentId = pendingDoc[0].id;
		const [version] = await pg.query(
			`INSERT INTO ai_document_versions (document_id, version_number, status, created_at)
			 VALUES ($1, 1, 'active', NOW()) RETURNING id`,
			{ bind: [documentId] }
		);
		versionId = version[0].id;

		// Chunk A embeds close to the query vector; chunk B is unrelated.
		const queryEmbedding = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0.01));
		const nearVector = Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0.0101));
		const farVector = Array.from({ length: 768 }, (_, i) => (i === 0 ? 0.01 : (i % 7 === 0 ? 1 : 0.02)));

		const insertChunk = async (docId, versionIdValue, index, content, vector) => {
			const literal = `[${vector.join(',')}]`;
			const [row] = await pg.query(
				`INSERT INTO ai_document_chunks (document_id, document_version_id, chunk_index, content, embedding, created_at)
				 VALUES ($1, $2, $3, $4, CAST($5 AS extensions.vector), NOW()) RETURNING id`,
				{ bind: [docId, versionIdValue, index, content, literal] }
			);
			return row[0].id;
		};

		chunkIds.push(await insertChunk(documentId, versionId, 0, 'Approved chunk about hand hygiene.', nearVector));
		chunkIds.push(await insertChunk(documentId, versionId, 1, 'Approved chunk about mentorship feedback.', farVector));
		chunkIds.push(await insertChunk(pendingDocumentId, null, 0, 'Pending doc chunk that must never be retrieved.', nearVector));

		// 1. Cosine similarity returns the nearest approved chunk first.
		const results = await repository.searchSimilarChunks({
			queryEmbedding,
			limit: 5,
			sequelizeInstance: pg,
		});
		assert.ok(results.length >= 1, 'expected at least one retrieved chunk');
		assert.equal(results[0].chunk_id, chunkIds[0], 'nearest chunk should rank first');
		assert.equal(results[0].document_id, documentId);
		assert.ok(results[0].score > 0.9, `expected high similarity, got ${results[0].score}`);

		// 2. Pending document chunks are excluded.
		assert.ok(
			results.every((row) => row.document_id !== pendingDocumentId),
			'pending document chunks must not be retrieved'
		);

		// 3. documentId filter scopes retrieval to a single document.
		const scoped = await repository.searchSimilarChunks({
			queryEmbedding,
			limit: 5,
			documentId: pendingDocumentId,
			sequelizeInstance: pg,
		});
		assert.deepEqual(scoped, [], 'documentId filter should exclude non-approved docs entirely');

		// 4. access_scope filter excludes restricted documents for other scopes.
		const restricted = await pg.query(
			`INSERT INTO ai_documents (title, status, processing_status, access_scope, language, created_at, updated_at)
			 VALUES ($1, 'approved', 'completed', 'mentors', 'en', NOW(), NOW()) RETURNING id`,
			{ bind: [`pgvector-test-restricted-${suffix}`] }
		);
		const restrictedId = restricted[0][0].id;
		restrictedDocumentId = restrictedId;
		const restrictedChunkId = await insertChunk(restrictedId, null, 0, 'Mentor-only chunk.', nearVector);
		chunkIds.push(restrictedChunkId);

		const menteeScope = await repository.searchSimilarChunks({
			queryEmbedding,
			limit: 10,
			accessScope: 'mentees',
			sequelizeInstance: pg,
		});
		assert.ok(
			menteeScope.every((row) => row.document_id !== restrictedId),
			'mentor-scoped documents must not appear in mentee retrieval'
		);
		const mentorScope = await repository.searchSimilarChunks({
			queryEmbedding,
			limit: 10,
			accessScope: 'mentors',
			sequelizeInstance: pg,
		});
		assert.ok(
			mentorScope.some((row) => row.document_id === restrictedId),
			'mentor-scoped documents must appear in mentor retrieval'
		);
	} finally {
		if (chunkIds.length) {
			await pg.query('DELETE FROM ai_document_chunks WHERE id = ANY($1)', { bind: [chunkIds] }).catch(() => {});
		}
		if (versionId) {
			await pg.query('DELETE FROM ai_document_versions WHERE id = $1', { bind: [versionId] }).catch(() => {});
		}
		for (const id of [documentId, pendingDocumentId, restrictedDocumentId]) {
			if (id) await pg.query('DELETE FROM ai_documents WHERE id = $1', { bind: [id] }).catch(() => {});
		}
		await pg.close();
	}
});
