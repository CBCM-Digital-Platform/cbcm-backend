module.exports = (sequelize, DataTypes) => sequelize.define('PasswordResetToken', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	user_id: { type: DataTypes.INTEGER },
	token_hash: { type: DataTypes.STRING },
	requested_at: { type: DataTypes.DATE },
	expires_at: { type: DataTypes.DATE },
	used_at: { type: DataTypes.DATE },
	failed_attempts: { type: DataTypes.INTEGER, defaultValue: 0, allowNull: false },
}, { tableName: 'password_reset_tokens', timestamps: false });
