module.exports = (sequelize, DataTypes) => sequelize.define('EncounterFocusArea', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	encounter_id: { type: DataTypes.INTEGER },
	thematic_area_id: { type: DataTypes.INTEGER },
}, { tableName: 'encounter_focus_areas', timestamps: false });
