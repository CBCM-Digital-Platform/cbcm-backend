module.exports = (sequelize, DataTypes) => sequelize.define('Resource', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	title: { type: DataTypes.STRING },
	type: { type: DataTypes.STRING },
	thematic_area_id: { type: DataTypes.INTEGER },
	url: { type: DataTypes.STRING },
	file_id: { type: DataTypes.INTEGER },
	created_by: { type: DataTypes.INTEGER },
	updated_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'resources', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
