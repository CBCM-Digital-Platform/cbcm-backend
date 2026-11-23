'use strict';

const INDEX_NAME = 'uq_thematic_areas_name_ci';

module.exports = {
	async up(queryInterface) {
		const indexes = await queryInterface.sequelize.query(
			`SELECT indexname FROM pg_indexes WHERE tablename = 'thematic_areas' AND indexname = '${INDEX_NAME}'`,
			{ type: queryInterface.sequelize.QueryTypes.SELECT }
		);
		if (indexes.length) return;

		await queryInterface.sequelize.query(
			`CREATE UNIQUE INDEX "${INDEX_NAME}" ON thematic_areas (LOWER(TRIM(name)))`
		);
	},

	async down(queryInterface) {
		await queryInterface.sequelize.query(`DROP INDEX IF EXISTS "${INDEX_NAME}"`);
	},
};
