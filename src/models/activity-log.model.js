module.exports = (sequelize, DataTypes) => sequelize.define('ActivityLog', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	actor_id: { type: DataTypes.INTEGER },
	facility_id: { type: DataTypes.INTEGER },
	action: { type: DataTypes.STRING },
	entity_type: { type: DataTypes.STRING },
	entity_id: { type: DataTypes.INTEGER },
	details: { type: DataTypes.TEXT },
	before_data: { type: DataTypes.JSONB },
	after_data: { type: DataTypes.JSONB },
	ip_address: { type: DataTypes.STRING },
	user_agent: { type: DataTypes.STRING },
	created_at: { type: DataTypes.DATE },
}, { tableName: 'activity_logs', timestamps: true, createdAt: 'created_at', updatedAt: false });
