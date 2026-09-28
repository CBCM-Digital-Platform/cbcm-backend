module.exports = (sequelize, DataTypes) => sequelize.define('NewsPost', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	title: { type: DataTypes.STRING },
	body: { type: DataTypes.TEXT },
	image_file_id: { type: DataTypes.INTEGER },
	target_audience: { type: DataTypes.STRING },
	status: { type: DataTypes.STRING },
	scheduled_at: { type: DataTypes.DATE },
	created_by: { type: DataTypes.INTEGER },
	updated_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'news_posts', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
