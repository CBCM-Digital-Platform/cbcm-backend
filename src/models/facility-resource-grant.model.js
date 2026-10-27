module.exports = (sequelize, DataTypes) => sequelize.define('FacilityResourceGrant', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	resource_id: { type: DataTypes.INTEGER, allowNull: false },
	facility_id: { type: DataTypes.INTEGER, allowNull: false },
	granted_by: { type: DataTypes.INTEGER, allowNull: false },
	grant_status: { 
		type: DataTypes.ENUM('active', 'revoked'), 
		default: 'active',
		allowNull: false 
	},
	granted_at: { type: DataTypes.DATE, allowNull: false },
	revoked_at: { type: DataTypes.DATE, allowNull: true },
	revoked_by: { type: DataTypes.INTEGER, allowNull: true },
}, { 
	tableName: 'facility_resource_grants', 
	timestamps: false,
	indexes: [
		{ unique: true, fields: ['resource_id', 'facility_id'], where: { grant_status: 'active' } },
		{ fields: ['facility_id'] },
		{ fields: ['resource_id'] },
	]
});
