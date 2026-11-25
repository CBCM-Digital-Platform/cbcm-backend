module.exports = (sequelize, DataTypes) => sequelize.define('ExamResult', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  attempt_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  exam_id: { type: DataTypes.INTEGER, allowNull: false },
  mentee_id: { type: DataTypes.INTEGER, allowNull: false },
  score: { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0 } },
  total_marks: { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0 } },
  percentage: { type: DataTypes.FLOAT, allowNull: false, validate: { min: 0, max: 100 } },
  passed: { type: DataTypes.BOOLEAN, allowNull: false },
  evaluated_at: { type: DataTypes.DATE, allowNull: false },
  created_at: { type: DataTypes.DATE },
  updated_at: { type: DataTypes.DATE },
}, { tableName: 'exam_results', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [
  { fields: ['exam_id', 'mentee_id'], name: 'idx_exam_results_exam_mentee' },
] });
