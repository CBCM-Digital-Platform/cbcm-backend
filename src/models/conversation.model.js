module.exports = (sequelize, DataTypes) => sequelize.define('Conversation', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	created_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
}, { tableName: 'conversations', timestamps: true, createdAt: 'created_at', updatedAt: false });
