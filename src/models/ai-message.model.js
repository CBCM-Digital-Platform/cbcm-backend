module.exports = (sequelize, DataTypes) => sequelize.define('AIMessage', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	conversation_id: { type: DataTypes.INTEGER },
	role: { type: DataTypes.STRING },
	content: { type: DataTypes.TEXT },
	attachment_file_id: { type: DataTypes.INTEGER },
	model: { type: DataTypes.STRING },
	token_usage: { type: DataTypes.JSON },
	created_at: { type: DataTypes.DATE },
}, { tableName: 'ai_messages', timestamps: true, createdAt: 'created_at', updatedAt: false });
