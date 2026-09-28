module.exports = (sequelize, DataTypes) => sequelize.define('StarredResource', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	resource_id: { type: DataTypes.INTEGER },
	user_id: { type: DataTypes.INTEGER },
	starred_at: { type: DataTypes.DATE },
}, { tableName: 'starred_resources', timestamps: false });
