module.exports = (sequelize, DataTypes) => sequelize.define('ExamQuestion', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  exam_id: { type: DataTypes.INTEGER, allowNull: false },
  question_text: { type: DataTypes.TEXT, allowNull: false },
  question_type: { type: DataTypes.STRING, allowNull: false, defaultValue: 'single_choice', validate: { isIn: [['single_choice']] } },
  marks: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 1, validate: { min: 0 } },
  order_number: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
  created_at: { type: DataTypes.DATE },
  updated_at: { type: DataTypes.DATE },
}, { tableName: 'exam_questions', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [
  { unique: true, fields: ['exam_id', 'order_number'], name: 'uq_exam_questions_exam_order' },
] });
