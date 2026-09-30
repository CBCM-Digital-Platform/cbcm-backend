module.exports = (sequelize, DataTypes) => sequelize.define('Conversation', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	created_by: { type: DataTypes.INTEGER },
	type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'direct' },
	last_message_id: { type: DataTypes.INTEGER },
	last_message_at: { type: DataTypes.DATE },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
	}, { tableName: 'conversations', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
