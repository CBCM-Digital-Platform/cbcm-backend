module.exports = (sequelize, DataTypes) => sequelize.define('AssessmentPassingRule', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	cycle_id: { type: DataTypes.INTEGER, allowNull: true },
	thematic_area_id: { type: DataTypes.INTEGER, allowNull: true },
	criteria_min_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 70 },
	theory_min_score: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 80 },
	practical_min_score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 3 },
	is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
	created_by: { type: DataTypes.INTEGER },
	updated_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'assessment_passing_rules', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
