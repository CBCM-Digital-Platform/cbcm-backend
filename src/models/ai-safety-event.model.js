module.exports = (sequelize, DataTypes) => sequelize.define('AISafetyEvent', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	user_id: { type: DataTypes.INTEGER },
	conversation_id: { type: DataTypes.INTEGER },
	category: { type: DataTypes.STRING, allowNull: false },
	detail: { type: DataTypes.TEXT },
	created_at: { type: DataTypes.DATE },
}, {
	tableName: 'ai_safety_events',
	timestamps: false,
	createdAt: 'created_at',
	updatedAt: false,
});
