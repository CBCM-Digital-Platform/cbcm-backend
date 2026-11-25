module.exports = (sequelize, DataTypes) => sequelize.define('ExamAttempt', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  exam_id: { type: DataTypes.INTEGER, allowNull: false },
  mentee_id: { type: DataTypes.INTEGER, allowNull: false },
  attempt_number: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'IN_PROGRESS', validate: { isIn: [['IN_PROGRESS', 'SUBMITTED']] } },
  started_at: { type: DataTypes.DATE, allowNull: false },
  submitted_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE },
  updated_at: { type: DataTypes.DATE },
}, { tableName: 'exam_attempts', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [
  { unique: true, fields: ['exam_id', 'mentee_id', 'attempt_number'], name: 'uq_exam_attempts_exam_mentee_number' },
] });
