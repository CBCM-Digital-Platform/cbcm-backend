module.exports = (sequelize, DataTypes) => sequelize.define('AIConversation', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	user_id: { type: DataTypes.INTEGER },
	title: { type: DataTypes.STRING },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'ai_conversations', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
