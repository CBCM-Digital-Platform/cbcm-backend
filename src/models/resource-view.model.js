module.exports = (sequelize, DataTypes) => sequelize.define('ResourceView', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	resource_id: { type: DataTypes.INTEGER },
	user_id: { type: DataTypes.INTEGER },
	viewed_at: { type: DataTypes.DATE },
	completed: { type: DataTypes.BOOLEAN },
}, { tableName: 'resource_views', timestamps: false });
