module.exports = (sequelize, DataTypes) => sequelize.define('FAQ', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	category: { type: DataTypes.STRING },
	question: { type: DataTypes.TEXT },
	answer: { type: DataTypes.TEXT },
	created_by: { type: DataTypes.INTEGER },
	updated_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'faqs', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
