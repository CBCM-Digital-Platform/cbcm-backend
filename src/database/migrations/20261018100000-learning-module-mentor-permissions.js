'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		const tables = await queryInterface.showAllTables();
		const tableExists = tables.some((entry) => (
			String(typeof entry === 'string' ? entry : entry.tableName || entry.table_name).toLowerCase()
				=== 'learning_module_mentor_permissions'
		));
		if (!tableExists) {
			await queryInterface.createTable('learning_module_mentor_permissions', {
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
				permission: { type: Sequelize.STRING, allowNull: false },
				granted_by: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'users', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'RESTRICT',
				},
				granted_at: { type: Sequelize.DATE, allowNull: false },
				revoked_by: {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: { model: 'users', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'RESTRICT',
				},
				revoked_at: { type: Sequelize.DATE, allowNull: true },
			});
		}

		const indexes = await queryInterface.showIndex('learning_module_mentor_permissions');
		if (!indexes.some((index) => index.name === 'uq_active_learning_module_mentor_permission')) {
			await queryInterface.addIndex(
				'learning_module_mentor_permissions',
				['module_id', 'mentor_id', 'permission'],
				{
					unique: true,
					where: { revoked_at: null },
					name: 'uq_active_learning_module_mentor_permission',
				}
			);
		}
		if (!indexes.some((index) => index.name === 'idx_learning_module_mentor_permissions_mentor')) {
			await queryInterface.addIndex('learning_module_mentor_permissions', ['mentor_id'], {
				name: 'idx_learning_module_mentor_permissions_mentor',
			});
		}

		const legacyTableExists = tables.some((entry) => (
			String(typeof entry === 'string' ? entry : entry.tableName || entry.table_name).toLowerCase()
				=== 'learning_module_mentor_access'
		));
		if (legacyTableExists) {
			await queryInterface.sequelize.query(`
				INSERT INTO learning_module_mentor_permissions
					(module_id, mentor_id, permission, granted_by, granted_at, revoked_by, revoked_at)
				SELECT access.module_id, access.mentor_id, 'learning.resources.view',
					access.granted_by, access.granted_at, NULL, NULL
				FROM learning_module_mentor_access AS access
				WHERE access.revoked_at IS NULL
					AND NOT EXISTS (
						SELECT 1
						FROM learning_module_mentor_permissions AS permission
						WHERE permission.module_id = access.module_id
							AND permission.mentor_id = access.mentor_id
							AND permission.permission = 'learning.resources.view'
							AND permission.revoked_at IS NULL
					)
			`);
		}
	},

	async down() {
		throw new Error('This Learning migration is intentionally irreversible to preserve permission history.');
	},
};
