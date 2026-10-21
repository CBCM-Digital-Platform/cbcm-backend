module.exports = (sequelize, DataTypes) => sequelize.define('LearningModuleMentorPermission', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	module_id: { type: DataTypes.INTEGER, allowNull: false },
	mentor_id: { type: DataTypes.INTEGER, allowNull: false },
	permission: { type: DataTypes.STRING, allowNull: false },
	granted_by: { type: DataTypes.INTEGER, allowNull: false },
	granted_at: { type: DataTypes.DATE, allowNull: false },
	revoked_by: { type: DataTypes.INTEGER },
	revoked_at: { type: DataTypes.DATE },
}, { tableName: 'learning_module_mentor_permissions', timestamps: false });
