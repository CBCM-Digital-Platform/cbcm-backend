'use strict';

const TABLE = 'resources';

module.exports = {
	async up(queryInterface, Sequelize) {
		const columns = await queryInterface.describeTable(TABLE);
		if (!columns.category) {
			await queryInterface.addColumn(TABLE, 'category', {
				type: Sequelize.STRING,
				allowNull: true,
			});
		}
		if (!columns.examination_stage) {
			await queryInterface.addColumn(TABLE, 'examination_stage', {
				type: Sequelize.STRING,
				allowNull: true,
			});
		}
		if (!columns.is_required) {
			await queryInterface.addColumn(TABLE, 'is_required', {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: true,
			});
		}

	},

	async down() {
		throw new Error('This Resource migration is intentionally irreversible to preserve material classification data.');
	},
};
