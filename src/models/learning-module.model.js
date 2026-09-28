module.exports = (sequelize, DataTypes) => sequelize.define('LearningModule', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	title: { type: DataTypes.STRING },
	thematic_area_id: { type: DataTypes.INTEGER },
	protocol_summary: { type: DataTypes.TEXT },
	created_by: { type: DataTypes.INTEGER },
	updated_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'learning_modules', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
