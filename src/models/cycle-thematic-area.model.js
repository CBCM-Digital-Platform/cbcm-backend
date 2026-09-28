module.exports = (sequelize, DataTypes) => sequelize.define('CycleThematicArea', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	cycle_id: { type: DataTypes.INTEGER },
	thematic_area_id: { type: DataTypes.INTEGER },
	created_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
}, { tableName: 'cycle_thematic_areas', timestamps: true, createdAt: 'created_at', updatedAt: false });
