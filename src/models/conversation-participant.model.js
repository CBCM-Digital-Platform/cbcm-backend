module.exports = (sequelize, DataTypes) => sequelize.define('ConversationParticipant', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	conversation_id: { type: DataTypes.INTEGER },
	user_id: { type: DataTypes.INTEGER },
}, { tableName: 'conversation_participants', timestamps: false });
