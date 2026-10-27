module.exports = (sequelize, DataTypes) => sequelize.define('MenteeResourceAssignment', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	resource_id: { type: DataTypes.INTEGER, allowNull: false },
	mentor_id: { type: DataTypes.INTEGER, allowNull: false },
	mentee_id: { type: DataTypes.INTEGER, allowNull: false },
	facility_id: { type: DataTypes.INTEGER, allowNull: true },
	assignment_status: { 
		type: DataTypes.ENUM('active', 'revoked'), 
		default: 'active',
		allowNull: false 
	},
	assigned_by: { type: DataTypes.INTEGER, allowNull: false },
	assigned_at: { type: DataTypes.DATE, allowNull: false },
	revoked_at: { type: DataTypes.DATE, allowNull: true },
	revoked_by: { type: DataTypes.INTEGER, allowNull: true },
	learning_note: { type: DataTypes.TEXT, allowNull: true },
}, { 
	tableName: 'mentee_resource_assignments', 
	timestamps: false,
	indexes: [
		{ unique: true, fields: ['resource_id', 'mentee_id'], where: { assignment_status: 'active' } },
		{ fields: ['mentor_id'] },
		{ fields: ['mentee_id'] },
		{ fields: ['resource_id'] },
		{ fields: ['facility_id'] },
	]
});
