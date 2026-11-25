module.exports = (sequelize, DataTypes) => sequelize.define('AIMessageCitation', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	message_id: { type: DataTypes.INTEGER },
	source: { type: DataTypes.STRING },
	excerpt: { type: DataTypes.TEXT },
	url: { type: DataTypes.STRING },
	document_id: { type: DataTypes.INTEGER },
	document_version_id: { type: DataTypes.INTEGER },
	chunk_id: { type: DataTypes.INTEGER },
	page_number: { type: DataTypes.INTEGER },
	section_heading: { type: DataTypes.STRING },
}, { tableName: 'ai_message_citations', timestamps: false });
