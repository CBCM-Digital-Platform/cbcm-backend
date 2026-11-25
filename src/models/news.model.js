module.exports = (sequelize, DataTypes) => sequelize.define('News', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	title: {
		type: DataTypes.STRING(200),
		allowNull: false,
		validate: { len: [3, 200] },
	},
	slug: { type: DataTypes.STRING, allowNull: false },
	summary: {
		type: DataTypes.STRING(300),
		allowNull: true,
		validate: { len: [0, 300] },
	},
	content: { type: DataTypes.TEXT, allowNull: true },
	cover_image_url: { type: DataTypes.STRING, allowNull: true },
	category: {
		type: DataTypes.STRING(50),
		allowNull: true,
		validate: { len: [0, 50] },
	},
	status: {
		type: DataTypes.ENUM('draft', 'published', 'archived'),
		allowNull: false,
		defaultValue: 'draft',
	},
	published_at: { type: DataTypes.DATE, allowNull: true },
	author_id: { type: DataTypes.INTEGER, allowNull: false },
	created_at: { type: DataTypes.DATE, allowNull: false },
	updated_at: { type: DataTypes.DATE, allowNull: false },
}, {
	tableName: 'news',
	timestamps: true,
	createdAt: 'created_at',
	updatedAt: 'updated_at',
	indexes: [
		{ unique: true, fields: ['slug'] },
		{ fields: ['status', 'published_at'] },
	],
});
