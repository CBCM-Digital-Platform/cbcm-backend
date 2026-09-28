module.exports = (sequelize, DataTypes) => sequelize.define('CertificateTemplate', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	thematic_area_id: { type: DataTypes.INTEGER },
	name: { type: DataTypes.STRING },
	template_file_id: { type: DataTypes.INTEGER },
	created_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
}, { tableName: 'certificate_templates', timestamps: true, createdAt: 'created_at', updatedAt: false });
