module.exports = (sequelize, DataTypes) => sequelize.define('CycleFacility', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	cycle_id: { type: DataTypes.INTEGER },
	facility_id: { type: DataTypes.INTEGER },
	created_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
}, { tableName: 'cycle_facilities', timestamps: true, createdAt: 'created_at', updatedAt: false });
