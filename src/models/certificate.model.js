module.exports = (sequelize, DataTypes) => sequelize.define('Certificate', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	mentee_id: { type: DataTypes.INTEGER },
	cycle_id: { type: DataTypes.INTEGER },
	thematic_area_id: { type: DataTypes.INTEGER },
	template_id: { type: DataTypes.INTEGER },
	mentee_name_snapshot: { type: DataTypes.STRING },
	status: { type: DataTypes.STRING },
	pdf_url: { type: DataTypes.STRING },
	issued_by: { type: DataTypes.INTEGER },
	issued_at: { type: DataTypes.DATE },
	version: { type: DataTypes.INTEGER },
}, { tableName: 'certificates', timestamps: false });
