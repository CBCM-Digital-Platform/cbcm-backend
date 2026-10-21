module.exports = (sequelize, DataTypes) => sequelize.define('QuizAttemptAnswer', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	attempt_id: { type: DataTypes.INTEGER, allowNull: false },
	question_id: { type: DataTypes.INTEGER, allowNull: false },
	selected_option_id: { type: DataTypes.INTEGER },
	is_correct: { type: DataTypes.BOOLEAN, defaultValue: false },
	points_awarded: { type: DataTypes.FLOAT, defaultValue: 0 },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'quiz_attempt_answers', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
