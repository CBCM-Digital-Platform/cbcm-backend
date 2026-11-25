'use strict';

// Creates the AI knowledge-base, feedback, usage, and safety tables and enables
// pgvector for semantic chunk retrieval. The embedding column is
// extensions.vector(768), matching the default GEMINI_EMBEDDING_DIMENSIONS=768
// and the Supabase-recommended extension schema. If the embedding dimension is
// changed, this migration must be adjusted accordingly.
//
// pgvector is installed into the `extensions` schema (Supabase convention) and
// all vector types, operators, and operator classes are schema-qualified so the
// migration and queries do not depend on the session search_path.
//
// NOTE: this migration is NOT executed automatically. Run it explicitly after
// review: npm run migrate

const AI_CHUNK_EMBEDDING_DIMENSIONS = 768;
const VECTOR_TYPE = `extensions.vector(${AI_CHUNK_EMBEDDING_DIMENSIONS})`;
const COSINE_OPCLASS = 'extensions.vector_cosine_ops';

async function tableExists(queryInterface, name) {
	const tables = await queryInterface.showAllTables();
	return tables.some((entry) => String(typeof entry === 'string' ? entry : entry.tableName || entry.table_name).toLowerCase() === name);
}

async function columnExists(queryInterface, table, column, transaction) {
	const description = await queryInterface.describeTable(table, { transaction });
	return Object.prototype.hasOwnProperty.call(description, column);
}

async function addColumnIfMissing(queryInterface, table, column, definition, transaction) {
	if (await columnExists(queryInterface, table, column, transaction)) return;
	await queryInterface.addColumn(table, column, definition, { transaction });
}

module.exports = {
	async up(queryInterface, Sequelize) {
		const sequelize = queryInterface.sequelize;
		await sequelize.transaction(async (transaction) => {
			await sequelize.query(
				'CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions',
				{ transaction }
			);

			if (!(await tableExists(queryInterface, 'ai_documents'))) {
				await queryInterface.createTable('ai_documents', {
					id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
					title: { type: Sequelize.STRING, allowNull: false },
					description: { type: Sequelize.TEXT },
					category: { type: Sequelize.STRING },
					language: { type: Sequelize.STRING, defaultValue: 'en' },
					source_organization: { type: Sequelize.STRING },
					document_version: { type: Sequelize.STRING },
					publication_date: { type: Sequelize.DATEONLY },
					review_date: { type: Sequelize.DATEONLY },
					expiry_date: { type: Sequelize.DATEONLY },
					thematic_area_id: { type: Sequelize.INTEGER, references: { model: 'thematic_areas', key: 'id' } },
					access_scope: { type: Sequelize.STRING, defaultValue: 'all' },
					status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'pending' },
					processing_status: { type: Sequelize.STRING, defaultValue: 'pending' },
					processing_error: { type: Sequelize.TEXT },
					file_id: { type: Sequelize.INTEGER, references: { model: 'uploaded_files', key: 'id' } },
					uploaded_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
					approved_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
					approved_at: { type: Sequelize.DATE },
					created_at: { type: Sequelize.DATE },
					updated_at: { type: Sequelize.DATE },
				}, { transaction });
				await queryInterface.addIndex('ai_documents', ['status'], { name: 'idx_ai_documents_status', transaction });
				await queryInterface.addIndex('ai_documents', ['uploaded_by'], { name: 'idx_ai_documents_uploaded_by', transaction });
			}

			if (!(await tableExists(queryInterface, 'ai_document_versions'))) {
				await queryInterface.createTable('ai_document_versions', {
					id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
					document_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ai_documents', key: 'id' } },
					version_number: { type: Sequelize.INTEGER, allowNull: false },
					file_id: { type: Sequelize.INTEGER, references: { model: 'uploaded_files', key: 'id' } },
					status: { type: Sequelize.STRING, defaultValue: 'active' },
					created_by: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
					created_at: { type: Sequelize.DATE },
				}, { transaction });
				await queryInterface.addIndex('ai_document_versions', ['document_id', 'version_number'], { name: 'idx_ai_document_versions_doc_version', unique: true, transaction });
			}

			if (!(await tableExists(queryInterface, 'ai_document_chunks'))) {
				await queryInterface.createTable('ai_document_chunks', {
					id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
					document_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ai_documents', key: 'id' } },
					document_version_id: { type: Sequelize.INTEGER, references: { model: 'ai_document_versions', key: 'id' } },
					chunk_index: { type: Sequelize.INTEGER, allowNull: false },
					content: { type: Sequelize.TEXT, allowNull: false },
					page_number: { type: Sequelize.INTEGER },
					section_heading: { type: Sequelize.STRING },
					token_count: { type: Sequelize.INTEGER },
					metadata: { type: Sequelize.JSONB },
					created_at: { type: Sequelize.DATE },
				}, { transaction });
				await sequelize.query(
					`ALTER TABLE ai_document_chunks ADD COLUMN IF NOT EXISTS embedding ${VECTOR_TYPE}`,
					{ transaction }
				);
				await sequelize.query(
					`CREATE INDEX IF NOT EXISTS idx_ai_document_chunks_embedding ON ai_document_chunks USING hnsw (embedding ${COSINE_OPCLASS})`,
					{ transaction }
				);
				await queryInterface.addIndex('ai_document_chunks', ['document_id'], { name: 'idx_ai_document_chunks_document_id', transaction });
			}

			if (await tableExists(queryInterface, 'ai_conversations')) {
				await addColumnIfMissing(queryInterface, 'ai_conversations', 'status', { type: Sequelize.STRING, defaultValue: 'active' }, transaction);
				await addColumnIfMissing(queryInterface, 'ai_conversations', 'last_message_at', { type: Sequelize.DATE }, transaction);
			}
			if (await tableExists(queryInterface, 'ai_messages')) {
				await addColumnIfMissing(queryInterface, 'ai_messages', 'model', { type: Sequelize.STRING }, transaction);
				await addColumnIfMissing(queryInterface, 'ai_messages', 'token_usage', { type: Sequelize.JSONB }, transaction);
			}
			if (await tableExists(queryInterface, 'ai_message_citations')) {
				await addColumnIfMissing(queryInterface, 'ai_message_citations', 'document_id', { type: Sequelize.INTEGER, references: { model: 'ai_documents', key: 'id' } }, transaction);
				await addColumnIfMissing(queryInterface, 'ai_message_citations', 'document_version_id', { type: Sequelize.INTEGER, references: { model: 'ai_document_versions', key: 'id' } }, transaction);
				await addColumnIfMissing(queryInterface, 'ai_message_citations', 'chunk_id', { type: Sequelize.INTEGER, references: { model: 'ai_document_chunks', key: 'id' } }, transaction);
				await addColumnIfMissing(queryInterface, 'ai_message_citations', 'page_number', { type: Sequelize.INTEGER }, transaction);
				await addColumnIfMissing(queryInterface, 'ai_message_citations', 'section_heading', { type: Sequelize.STRING }, transaction);
			}

			if (!(await tableExists(queryInterface, 'ai_feedback'))) {
				await queryInterface.createTable('ai_feedback', {
					id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
					message_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'ai_messages', key: 'id' } },
					user_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
					rating: { type: Sequelize.STRING, allowNull: false },
					comment: { type: Sequelize.TEXT },
					created_at: { type: Sequelize.DATE },
				}, { transaction });
				await queryInterface.addIndex('ai_feedback', ['message_id'], { name: 'idx_ai_feedback_message_id', transaction });
			}

			if (!(await tableExists(queryInterface, 'ai_usage_logs'))) {
				await queryInterface.createTable('ai_usage_logs', {
					id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
					user_id: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
					conversation_id: { type: Sequelize.INTEGER, references: { model: 'ai_conversations', key: 'id' } },
					message_id: { type: Sequelize.INTEGER, references: { model: 'ai_messages', key: 'id' } },
					model: { type: Sequelize.STRING },
					prompt_tokens: { type: Sequelize.INTEGER },
					completion_tokens: { type: Sequelize.INTEGER },
					total_tokens: { type: Sequelize.INTEGER },
					latency_ms: { type: Sequelize.INTEGER },
					status: { type: Sequelize.STRING },
					error_code: { type: Sequelize.STRING },
					created_at: { type: Sequelize.DATE },
				}, { transaction });
				await queryInterface.addIndex('ai_usage_logs', ['created_at'], { name: 'idx_ai_usage_logs_created_at', transaction });
				await queryInterface.addIndex('ai_usage_logs', ['user_id'], { name: 'idx_ai_usage_logs_user_id', transaction });
			}

			if (!(await tableExists(queryInterface, 'ai_safety_events'))) {
				await queryInterface.createTable('ai_safety_events', {
					id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
					user_id: { type: Sequelize.INTEGER, references: { model: 'users', key: 'id' } },
					conversation_id: { type: Sequelize.INTEGER, references: { model: 'ai_conversations', key: 'id' } },
					category: { type: Sequelize.STRING, allowNull: false },
					detail: { type: Sequelize.TEXT },
					created_at: { type: Sequelize.DATE },
				}, { transaction });
				await queryInterface.addIndex('ai_safety_events', ['category'], { name: 'idx_ai_safety_events_category', transaction });
			}
		});
	},

	async down(queryInterface) {
		const sequelize = queryInterface.sequelize;
		await sequelize.transaction(async (transaction) => {
			await queryInterface.dropTable('ai_safety_events', { transaction }).catch(() => {});
			await queryInterface.dropTable('ai_usage_logs', { transaction }).catch(() => {});
			await queryInterface.dropTable('ai_feedback', { transaction }).catch(() => {});
			if (await tableExists(queryInterface, 'ai_message_citations')) {
				for (const column of ['document_id', 'document_version_id', 'chunk_id', 'page_number', 'section_heading']) {
					if (await columnExists(queryInterface, 'ai_message_citations', column, transaction)) {
						await queryInterface.removeColumn('ai_message_citations', column, { transaction });
					}
				}
			}
			if (await tableExists(queryInterface, 'ai_messages')) {
				for (const column of ['model', 'token_usage']) {
					if (await columnExists(queryInterface, 'ai_messages', column, transaction)) {
						await queryInterface.removeColumn('ai_messages', column, { transaction });
					}
				}
			}
			if (await tableExists(queryInterface, 'ai_conversations')) {
				for (const column of ['status', 'last_message_at']) {
					if (await columnExists(queryInterface, 'ai_conversations', column, transaction)) {
						await queryInterface.removeColumn('ai_conversations', column, { transaction });
					}
				}
			}
			await queryInterface.dropTable('ai_document_chunks', { transaction }).catch(() => {});
			await queryInterface.dropTable('ai_document_versions', { transaction }).catch(() => {});
			await queryInterface.dropTable('ai_documents', { transaction }).catch(() => {});
			// The shared `vector` extension is intentionally left installed.
		});
	},
};
