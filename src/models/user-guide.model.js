module.exports = (sequelize, DataTypes) => sequelize.define('UserGuide', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	title: { type: DataTypes.STRING },
	content: { type: DataTypes.TEXT },
	attachment_file_id: { type: DataTypes.INTEGER },
	target_audience: { type: DataTypes.STRING },
	facility_id: { type: DataTypes.INTEGER },
	created_by: { type: DataTypes.INTEGER },
	updated_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'user_guides', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
