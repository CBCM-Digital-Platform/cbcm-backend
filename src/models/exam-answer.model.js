module.exports = (sequelize, DataTypes) => sequelize.define('ExamAnswer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  attempt_id: { type: DataTypes.INTEGER, allowNull: false },
  question_id: { type: DataTypes.INTEGER, allowNull: false },
  selected_option_id: { type: DataTypes.INTEGER },
  created_at: { type: DataTypes.DATE },
  updated_at: { type: DataTypes.DATE },
}, { tableName: 'exam_answers', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [
  { unique: true, fields: ['attempt_id', 'question_id'], name: 'uq_exam_answers_attempt_question' },
] });
