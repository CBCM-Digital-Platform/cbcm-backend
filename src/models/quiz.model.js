module.exports = (sequelize, DataTypes) => sequelize.define('Quiz', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	module_id: { type: DataTypes.INTEGER },
	title: { type: DataTypes.STRING },
	created_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
}, { tableName: 'quizzes', timestamps: true, createdAt: 'created_at', updatedAt: false });
