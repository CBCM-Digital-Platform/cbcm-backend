module.exports = (sequelize, DataTypes) => sequelize.define('AssessmentChecklistItem', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	assessment_id: { type: DataTypes.INTEGER },
	item: { type: DataTypes.STRING },
	checked: { type: DataTypes.BOOLEAN },
}, { tableName: 'assessment_checklist_items', timestamps: false });
