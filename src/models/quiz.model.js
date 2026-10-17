module.exports = (sequelize, DataTypes) => sequelize.define('Quiz', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	module_id: { type: DataTypes.INTEGER, allowNull: false },
	title: { type: DataTypes.STRING, allowNull: false },
	description: { type: DataTypes.TEXT },
	pass_score: { type: DataTypes.FLOAT, defaultValue: 0 },
	time_limit_minutes: { type: DataTypes.INTEGER, defaultValue: 0 },
	attempt_limit: { type: DataTypes.INTEGER, defaultValue: 1 },
	is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
	is_authorized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
	created_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'quizzes', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
