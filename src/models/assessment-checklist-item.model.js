module.exports = (sequelize, DataTypes) => sequelize.define('AssessmentChecklistItem', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	assessment_id: { type: DataTypes.INTEGER },
	checklist_item_id: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
	item: { type: DataTypes.STRING },
	checked: { type: DataTypes.BOOLEAN },
	score: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
	required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
	response_status: { type: DataTypes.STRING, allowNull: true, defaultValue: null },
	comment: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
	not_applicable_reason: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
}, { tableName: 'assessment_checklist_items', timestamps: false });
