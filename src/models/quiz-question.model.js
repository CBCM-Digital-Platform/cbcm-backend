module.exports = (sequelize, DataTypes) => sequelize.define('QuizQuestion', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	quiz_id: { type: DataTypes.INTEGER },
	prompt: { type: DataTypes.TEXT },
	clinical_context: { type: DataTypes.TEXT },
}, { tableName: 'quiz_questions', timestamps: false });
