module.exports = (sequelize, DataTypes) => sequelize.define('Resource', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	title: { type: DataTypes.STRING, allowNull: false },
	type: { type: DataTypes.STRING, allowNull: false },
	thematic_area_id: { type: DataTypes.INTEGER, allowNull: true },
	module_id: { type: DataTypes.INTEGER, allowNull: true },
	url: { type: DataTypes.STRING, allowNull: true },
	file_id: { type: DataTypes.INTEGER, allowNull: true },
	legacy_hierarchical_resource_id: {
		type: DataTypes.INTEGER,
		allowNull: true,
		unique: 'uq_resources_legacy_hierarchical_resource_id',
	},
	created_by: { type: DataTypes.INTEGER },
	updated_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'resources', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
