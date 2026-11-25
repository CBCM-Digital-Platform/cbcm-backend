module.exports = (sequelize, DataTypes) => sequelize.define('QuizAnswerKeyApplication', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  resource_id: { type: DataTypes.INTEGER, allowNull: false },
  answer_key_file_id: { type: DataTypes.INTEGER, allowNull: false },
  thematic_area_id: { type: DataTypes.INTEGER, allowNull: false },
  quiz_id: { type: DataTypes.INTEGER, allowNull: false },
  created_by: { type: DataTypes.INTEGER, allowNull: false },
  status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'uploaded' },
  proposed_answers: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  warnings: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  confirmed_at: { type: DataTypes.DATE },
  confirmed_by: { type: DataTypes.INTEGER },
}, { tableName: 'quiz_answer_key_applications', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
