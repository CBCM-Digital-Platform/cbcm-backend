'use strict';

const TABLE = 'resource_assignments';
const COLUMNS = ['module_id', 'cycle_id', 'thematic_area_id'];

module.exports = {
	async up(queryInterface, Sequelize) {
		const columns = await queryInterface.describeTable(TABLE);
		for (const column of COLUMNS) {
			if (!columns[column]) {
				await queryInterface.addColumn(TABLE, column, {
					type: Sequelize.INTEGER,
					allowNull: true,
				});
			}
		}
	},

	async down() {
		throw new Error('This Resource Assignment migration is intentionally irreversible to preserve historical scope snapshots.');
	},
};
