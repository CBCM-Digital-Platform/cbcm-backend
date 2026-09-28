module.exports = (sequelize, DataTypes) => sequelize.define('AssessmentEvidence', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	assessment_id: { type: DataTypes.INTEGER },
	title: { type: DataTypes.STRING },
	file_id: { type: DataTypes.INTEGER },
	uploaded_by: { type: DataTypes.INTEGER },
	uploaded_at: { type: DataTypes.DATE },
}, { tableName: 'assessment_evidence', timestamps: false });
