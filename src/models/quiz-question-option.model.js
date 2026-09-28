module.exports = (sequelize, DataTypes) => sequelize.define('QuizQuestionOption', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	question_id: { type: DataTypes.INTEGER },
	text: { type: DataTypes.STRING },
	is_correct: { type: DataTypes.BOOLEAN },
}, { tableName: 'quiz_question_options', timestamps: false });
