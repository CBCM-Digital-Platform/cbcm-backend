module.exports = (sequelize, DataTypes) => sequelize.define('ExamOption', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  question_id: { type: DataTypes.INTEGER, allowNull: false },
  option_label: { type: DataTypes.STRING(1), allowNull: false, validate: { isIn: [['A', 'B', 'C', 'D']] } },
  option_text: { type: DataTypes.TEXT, allowNull: false },
  is_correct: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  created_at: { type: DataTypes.DATE },
  updated_at: { type: DataTypes.DATE },
}, { tableName: 'exam_options', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [
  { unique: true, fields: ['question_id', 'option_label'], name: 'uq_exam_options_question_label' },
  { unique: true, fields: ['question_id'], where: { is_correct: true }, name: 'uq_exam_options_one_correct' },
] });
