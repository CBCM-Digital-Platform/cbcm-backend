'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		const transaction = await queryInterface.sequelize.transaction();
		try {
			const columns = await queryInterface.describeTable('users', { transaction });
			if (!columns.thematic_area_id) {
				await queryInterface.addColumn('users', 'thematic_area_id', {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: { model: 'thematic_areas', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'SET NULL',
				}, { transaction });
			}

			const indexes = await queryInterface.sequelize.query(
				`SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname = 'idx_users_thematic_area_id'`,
				{ type: queryInterface.sequelize.QueryTypes.SELECT, transaction }
			);
			if (!indexes.length) {
				await queryInterface.addIndex('users', ['thematic_area_id'], {
					name: 'idx_users_thematic_area_id',
					transaction,
				});
			}

			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
	},

	async down(queryInterface) {
		const transaction = await queryInterface.sequelize.transaction();
		try {
			const columns = await queryInterface.describeTable('users', { transaction });
			if (columns.thematic_area_id) {
				await queryInterface.removeColumn('users', 'thematic_area_id', { transaction });
			}
			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
	},
};
