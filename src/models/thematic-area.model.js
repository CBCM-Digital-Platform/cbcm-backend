module.exports = (sequelize, DataTypes) => sequelize.define('ThematicArea', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	code: { type: DataTypes.STRING, unique: true },
	name: { type: DataTypes.STRING },
}, { tableName: 'thematic_areas', timestamps: false });
