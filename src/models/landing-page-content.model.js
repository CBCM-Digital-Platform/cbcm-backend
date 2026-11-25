module.exports = (sequelize, DataTypes) => sequelize.define('LandingPageContent', {
	id: { type: DataTypes.INTEGER, primaryKey: true },
	content: { type: DataTypes.JSON, allowNull: false },
	updated_by: { type: DataTypes.INTEGER, allowNull: true },
	created_at: { type: DataTypes.DATE, allowNull: false },
	updated_at: { type: DataTypes.DATE, allowNull: false },
}, {
	tableName: 'landing_page_contents',
	timestamps: true,
	createdAt: 'created_at',
	updatedAt: 'updated_at',
});
