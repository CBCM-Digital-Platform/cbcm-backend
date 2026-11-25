module.exports = (sequelize, DataTypes) => sequelize.define('AIFeedback', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	message_id: { type: DataTypes.INTEGER, allowNull: false },
	user_id: { type: DataTypes.INTEGER, allowNull: false },
	rating: { type: DataTypes.STRING, allowNull: false },
	comment: { type: DataTypes.TEXT },
	created_at: { type: DataTypes.DATE },
}, {
	tableName: 'ai_feedback',
	timestamps: false,
	createdAt: 'created_at',
	updatedAt: false,
});
