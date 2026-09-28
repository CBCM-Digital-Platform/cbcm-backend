module.exports = (sequelize, DataTypes) => sequelize.define('QuizAttempt', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	quiz_id: { type: DataTypes.INTEGER },
	mentee_id: { type: DataTypes.INTEGER },
	score: { type: DataTypes.FLOAT },
	passed: { type: DataTypes.BOOLEAN },
	attempted_at: { type: DataTypes.DATE },
}, { tableName: 'quiz_attempts', timestamps: false });
