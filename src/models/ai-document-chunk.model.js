// Note: the `embedding` vector(768) column is managed by raw SQL in the
// pgvector migration and is intentionally not mapped here. Vector reads and
// writes go through ai-knowledge.repository.js parameterized queries so the
// model stays portable to the SQLite test database.
module.exports = (sequelize, DataTypes) => sequelize.define('AIDocumentChunk', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	document_id: { type: DataTypes.INTEGER, allowNull: false },
	document_version_id: { type: DataTypes.INTEGER, allowNull: true },
	chunk_index: { type: DataTypes.INTEGER, allowNull: false },
	content: { type: DataTypes.TEXT, allowNull: false },
	page_number: { type: DataTypes.INTEGER, allowNull: true },
	section_heading: { type: DataTypes.STRING, allowNull: true },
	token_count: { type: DataTypes.INTEGER, allowNull: true },
	metadata: { type: DataTypes.JSON, allowNull: true },
	created_at: { type: DataTypes.DATE },
}, {
	tableName: 'ai_document_chunks',
	timestamps: false,
	createdAt: 'created_at',
	updatedAt: false,
});
