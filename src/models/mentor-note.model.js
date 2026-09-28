module.exports = (sequelize, DataTypes) => sequelize.define('MentorNote', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	encounter_id: { type: DataTypes.INTEGER },
	mentor_id: { type: DataTypes.INTEGER },
	note: { type: DataTypes.TEXT },
	created_at: { type: DataTypes.DATE },
}, { tableName: 'mentor_notes', timestamps: true, createdAt: 'created_at', updatedAt: false });
