module.exports = (sequelize, DataTypes) => sequelize.define('AssessmentCriteriaScore', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	assessment_id: { type: DataTypes.INTEGER },
	criterion: { type: DataTypes.STRING },
	score: { type: DataTypes.FLOAT },
}, { tableName: 'assessment_criteria_scores', timestamps: false });
