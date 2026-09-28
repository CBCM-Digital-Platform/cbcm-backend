module.exports = (sequelize, DataTypes) => sequelize.define('AIMessageCitation', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	message_id: { type: DataTypes.INTEGER },
	source: { type: DataTypes.STRING },
	excerpt: { type: DataTypes.TEXT },
	url: { type: DataTypes.STRING },
}, { tableName: 'ai_message_citations', timestamps: false });
