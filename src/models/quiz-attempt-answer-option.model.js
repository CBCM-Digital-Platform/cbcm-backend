module.exports = (sequelize, DataTypes) => sequelize.define('QuizAttemptAnswerOption', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	answer_id: { type: DataTypes.INTEGER, allowNull: false },
	option_id: { type: DataTypes.INTEGER, allowNull: false },
	created_at: { type: DataTypes.DATE },
}, {
	tableName: 'quiz_attempt_answer_options',
	timestamps: false,
	indexes: [{ unique: true, fields: ['answer_id', 'option_id'] }],
});
