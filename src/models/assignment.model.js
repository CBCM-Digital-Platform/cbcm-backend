module.exports = (sequelize, DataTypes) => sequelize.define('Assignment', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	mentor_id: { type: DataTypes.INTEGER },
	mentee_id: { type: DataTypes.INTEGER },
	facility_id: { type: DataTypes.INTEGER },
	cycle_id: { type: DataTypes.INTEGER },
	thematic_area_id: { type: DataTypes.INTEGER },
	status: { type: DataTypes.STRING },
	priority_score: { type: DataTypes.FLOAT },
	matching_reason: { type: DataTypes.TEXT },
	assigned_by: { type: DataTypes.INTEGER },
	assigned_at: { type: DataTypes.DATE },
	unassigned_at: { type: DataTypes.DATE },
}, { tableName: 'assignments', timestamps: false });
