module.exports = (sequelize, DataTypes) => sequelize.define('QuizAttemptAnswer', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	attempt_id: { type: DataTypes.INTEGER },
	question_id: { type: DataTypes.INTEGER },
	selected_option_id: { type: DataTypes.INTEGER },
	is_correct: { type: DataTypes.BOOLEAN },
}, { tableName: 'quiz_attempt_answers', timestamps: false });
