module.exports = (sequelize, DataTypes) => sequelize.define('AssessmentChecklistItem', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	assessment_id: { type: DataTypes.INTEGER },
	item: { type: DataTypes.STRING },
	checked: { type: DataTypes.BOOLEAN },
	score: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
	required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, { tableName: 'assessment_checklist_items', timestamps: false });
