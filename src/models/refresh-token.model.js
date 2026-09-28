module.exports = (sequelize, DataTypes) => sequelize.define('RefreshToken', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	user_id: { type: DataTypes.INTEGER },
	token_hash: { type: DataTypes.STRING },
	device_info: { type: DataTypes.STRING },
	issued_at: { type: DataTypes.DATE },
	expires_at: { type: DataTypes.DATE },
	revoked_at: { type: DataTypes.DATE },
}, { tableName: 'refresh_tokens', timestamps: false });
