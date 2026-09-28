module.exports = (sequelize, DataTypes) => sequelize.define('UserCredential', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	user_id: { type: DataTypes.INTEGER },
	title: { type: DataTypes.STRING },
	icon_url: { type: DataTypes.STRING },
	issued_by: { type: DataTypes.INTEGER },
	issued_at: { type: DataTypes.DATE },
}, { tableName: 'user_credentials', timestamps: false });
