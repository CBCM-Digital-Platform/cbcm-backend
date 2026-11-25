module.exports = (sequelize, DataTypes) => sequelize.define('AIDocumentVersion', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	document_id: { type: DataTypes.INTEGER, allowNull: false },
	version_number: { type: DataTypes.INTEGER, allowNull: false },
	file_id: { type: DataTypes.INTEGER },
	status: { type: DataTypes.STRING, defaultValue: 'active' },
	created_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
}, {
	tableName: 'ai_document_versions',
	timestamps: false,
	createdAt: 'created_at',
	updatedAt: false,
});
