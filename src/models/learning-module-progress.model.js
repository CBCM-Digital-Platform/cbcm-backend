module.exports = (sequelize, DataTypes) => sequelize.define('LearningModuleProgress', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	mentee_id: { type: DataTypes.INTEGER },
	module_id: { type: DataTypes.INTEGER },
	assigned_by: { type: DataTypes.INTEGER },
	assigned_at: { type: DataTypes.DATE },
	status: { type: DataTypes.STRING, defaultValue: 'not_started' },
	completion_percentage: { type: DataTypes.FLOAT, defaultValue: 0 },
	started_at: { type: DataTypes.DATE },
	last_accessed_at: { type: DataTypes.DATE },
	completed_at: { type: DataTypes.DATE },
}, { tableName: 'learning_module_progress', timestamps: false });
