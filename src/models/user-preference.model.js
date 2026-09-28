module.exports = (sequelize, DataTypes) => sequelize.define('UserPreference', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	user_id: { type: DataTypes.INTEGER, unique: true },
	language: { type: DataTypes.STRING },
	theme: { type: DataTypes.STRING },
	notifications_enabled: { type: DataTypes.BOOLEAN },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'user_preferences', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
