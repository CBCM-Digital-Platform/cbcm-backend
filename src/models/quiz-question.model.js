module.exports = (sequelize, DataTypes) => sequelize.define('QuizQuestion', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	quiz_id: { type: DataTypes.INTEGER, allowNull: false },
	prompt: { type: DataTypes.TEXT, allowNull: false },
	question_type: { type: DataTypes.STRING, defaultValue: 'single_choice' },
	clinical_context: { type: DataTypes.TEXT },
	points: { type: DataTypes.FLOAT, defaultValue: 1 },
	explanation: { type: DataTypes.TEXT },
	order_number: { type: DataTypes.INTEGER, defaultValue: 0 },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'quiz_questions', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
