module.exports = (sequelize, DataTypes) => sequelize.define('MessageRead', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	message_id: { type: DataTypes.INTEGER },
	user_id: { type: DataTypes.INTEGER },
	read_at: { type: DataTypes.DATE },
}, { tableName: 'message_reads', timestamps: false });
