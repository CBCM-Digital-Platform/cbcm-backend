module.exports = (sequelize, DataTypes) => sequelize.define('Exam', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  stage: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: { isIn: [['PRE_TEST', 'POST_TEST']] },
  },
  thematic_area_id: { type: DataTypes.INTEGER, allowNull: false },
  cycle_id: { type: DataTypes.INTEGER, allowNull: false },
  version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1, validate: { min: 1 } },
  total_questions: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  total_marks: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0, validate: { min: 0 } },
  pass_percentage: { type: DataTypes.FLOAT, allowNull: true, validate: { min: 0, max: 100 } },
  is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  is_authorized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  created_by: { type: DataTypes.INTEGER },
  updated_by: { type: DataTypes.INTEGER },
  created_at: { type: DataTypes.DATE },
  updated_at: { type: DataTypes.DATE },
}, { tableName: 'exams', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at', indexes: [
  { unique: true, fields: ['thematic_area_id', 'cycle_id', 'stage', 'version'], name: 'uq_exams_scope_stage_version' },
] });
