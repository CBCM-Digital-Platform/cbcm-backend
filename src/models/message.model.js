module.exports = (sequelize, DataTypes) => sequelize.define('Message', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	conversation_id: { type: DataTypes.INTEGER },
	sender_id: { type: DataTypes.INTEGER },
	content: { type: DataTypes.TEXT },
	attachment_file_id: { type: DataTypes.INTEGER },
	sent_at: { type: DataTypes.DATE },
}, { tableName: 'messages', timestamps: false });
