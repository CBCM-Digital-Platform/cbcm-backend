module.exports = (sequelize, DataTypes) => sequelize.define('LearningModuleProgress', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	mentee_id: { type: DataTypes.INTEGER },
	module_id: { type: DataTypes.INTEGER },
	status: { type: DataTypes.STRING },
	started_at: { type: DataTypes.DATE },
	completed_at: { type: DataTypes.DATE },
}, { tableName: 'learning_module_progress', timestamps: false });
