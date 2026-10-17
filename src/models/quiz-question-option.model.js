module.exports = (sequelize, DataTypes) => sequelize.define('QuizQuestionOption', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	question_id: { type: DataTypes.INTEGER, allowNull: false },
	text: { type: DataTypes.STRING, allowNull: false },
	is_correct: { type: DataTypes.BOOLEAN, defaultValue: false },
	order_number: { type: DataTypes.INTEGER, defaultValue: 0 },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'quiz_question_options', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
