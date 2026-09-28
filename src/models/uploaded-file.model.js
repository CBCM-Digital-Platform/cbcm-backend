module.exports = (sequelize, DataTypes) => sequelize.define('UploadedFile', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	owner_id: { type: DataTypes.INTEGER },
	context: { type: DataTypes.STRING },
	storage_key: { type: DataTypes.STRING },
	mime_type: { type: DataTypes.STRING },
	size_bytes: { type: DataTypes.BIGINT },
	created_at: { type: DataTypes.DATE },
}, { tableName: 'uploaded_files', timestamps: true, createdAt: 'created_at', updatedAt: false });
