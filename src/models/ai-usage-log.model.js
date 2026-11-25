module.exports = (sequelize, DataTypes) => sequelize.define('AIUsageLog', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	user_id: { type: DataTypes.INTEGER },
	conversation_id: { type: DataTypes.INTEGER },
	message_id: { type: DataTypes.INTEGER },
	model: { type: DataTypes.STRING },
	prompt_tokens: { type: DataTypes.INTEGER },
	completion_tokens: { type: DataTypes.INTEGER },
	total_tokens: { type: DataTypes.INTEGER },
	latency_ms: { type: DataTypes.INTEGER },
	status: { type: DataTypes.STRING },
	error_code: { type: DataTypes.STRING },
	created_at: { type: DataTypes.DATE },
}, {
	tableName: 'ai_usage_logs',
	timestamps: false,
	createdAt: 'created_at',
	updatedAt: false,
});
