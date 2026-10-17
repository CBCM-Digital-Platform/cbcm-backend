'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		const tables = await queryInterface.showAllTables();
		const exists = tables.some((entry) => (
			String(typeof entry === 'string' ? entry : entry.tableName || entry.table_name).toLowerCase()
				=== 'learning_module_mentor_access'
		));
		if (!exists) {
			await queryInterface.createTable('learning_module_mentor_access', {
				id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
				module_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'learning_modules', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'CASCADE',
				},
				mentor_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'users', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'CASCADE',
				},
				granted_by: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'users', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'RESTRICT',
				},
				granted_at: { type: Sequelize.DATE, allowNull: false },
				revoked_at: { type: Sequelize.DATE, allowNull: true },
			});
		}

		const indexes = await queryInterface.showIndex('learning_module_mentor_access');
		if (!indexes.some((index) => index.unique
			&& index.fields.map((field) => field.attribute || field.name).join(',') === 'module_id,mentor_id')) {
			await queryInterface.addIndex('learning_module_mentor_access', ['module_id', 'mentor_id'], {
				unique: true,
				name: 'uq_learning_module_mentor_access_module_mentor',
			});
		}
		if (!indexes.some((index) => index.fields.map((field) => field.attribute || field.name).join(',') === 'mentor_id')) {
			await queryInterface.addIndex('learning_module_mentor_access', ['mentor_id'], {
				name: 'idx_learning_module_mentor_access_mentor',
			});
		}
	},

	async down() {
		throw new Error('This Learning migration is intentionally irreversible to preserve mentor access history.');
	},
};
