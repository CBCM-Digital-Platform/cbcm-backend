module.exports = (sequelize, DataTypes) => sequelize.define('Notification', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	user_id: { type: DataTypes.INTEGER },
	type: { type: DataTypes.STRING },
	event_key: { type: DataTypes.STRING },
	title: { type: DataTypes.STRING },
	body: { type: DataTypes.TEXT },
	is_read: { type: DataTypes.BOOLEAN },
	reference_type: { type: DataTypes.STRING },
	reference_id: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
}, { tableName: 'notifications', timestamps: true, createdAt: 'created_at', updatedAt: false });
