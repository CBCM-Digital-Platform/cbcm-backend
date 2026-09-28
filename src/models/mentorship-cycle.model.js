module.exports = (sequelize, DataTypes) => sequelize.define('MentorshipCycle', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	name: { type: DataTypes.STRING },
	status: { type: DataTypes.STRING },
	start_date: { type: DataTypes.DATEONLY },
	end_date: { type: DataTypes.DATEONLY },
	created_by: { type: DataTypes.INTEGER },
	updated_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'mentorship_cycles', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
