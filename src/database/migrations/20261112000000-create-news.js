'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		await queryInterface.createTable('news', {
			id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
			title: { type: Sequelize.STRING(200), allowNull: false },
			slug: { type: Sequelize.STRING, allowNull: false },
			summary: { type: Sequelize.STRING(300), allowNull: true },
			content: { type: Sequelize.TEXT, allowNull: true },
			cover_image_url: { type: Sequelize.STRING, allowNull: true },
			category: { type: Sequelize.STRING(50), allowNull: true },
			status: { type: Sequelize.ENUM('draft', 'published', 'archived'), allowNull: false, defaultValue: 'draft' },
			published_at: { type: Sequelize.DATE, allowNull: true },
			author_id: {
				type: Sequelize.INTEGER,
				allowNull: false,
				references: { model: 'users', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'RESTRICT',
			},
			created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
			updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
		});
		await queryInterface.addIndex('news', ['slug'], { unique: true, name: 'news_slug_unique' });
		await queryInterface.addIndex('news', ['status', 'published_at'], { name: 'news_status_published_at_idx' });
	},

	async down(queryInterface) {
		await queryInterface.dropTable('news');
		if (queryInterface.sequelize.getDialect() === 'postgres') {
			await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_news_status";');
		}
	},
};
