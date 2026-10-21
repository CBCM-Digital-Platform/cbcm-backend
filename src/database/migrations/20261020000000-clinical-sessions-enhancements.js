'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		const tableNames = await queryInterface.showAllTables();
		const tableExists = (tableName) => tableNames.some((entry) => (
			String(typeof entry === 'string' ? entry : entry.tableName || entry.table_name).toLowerCase() === tableName.toLowerCase()
		));
		const describeIfExists = (tableName) => tableExists(tableName) ? queryInterface.describeTable(tableName) : null;

		const clinicalEncounters = await describeIfExists('clinical_encounters');
		if (clinicalEncounters) {
			const addColumns = [
				['duration_minutes', { type: Sequelize.INTEGER, allowNull: true, defaultValue: null }],
				['jitsi_room_id', { type: Sequelize.STRING, allowNull: true, defaultValue: null }],
				['jitsi_room_enabled', { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false }],
				['preparation_notes', { type: Sequelize.TEXT, allowNull: true, defaultValue: null }],
			];
			for (const [columnName, options] of addColumns) {
				if (!clinicalEncounters[columnName]) {
					await queryInterface.addColumn('clinical_encounters', columnName, options);
				}
			}

			// Add indexes
			const indexes = await queryInterface.showIndex('clinical_encounters');
			if (!indexes.some((index) => index.name === 'idx_clinical_encounters_jitsi_room_id')) {
				await queryInterface.addIndex('clinical_encounters', ['jitsi_room_id'], {
					unique: true,
					name: 'idx_clinical_encounters_jitsi_room_id',
				});
			}
			if (!indexes.some((index) => index.name === 'idx_clinical_encounters_duration_minutes')) {
				await queryInterface.addIndex('clinical_encounters', ['duration_minutes'], {
					unique: false,
					name: 'idx_clinical_encounters_duration_minutes',
				});
			}
		}
	},

	async down(queryInterface, Sequelize) {
		const tableNames = await queryInterface.showAllTables();
		const tableExists = (tableName) => tableNames.some((entry) => (
			String(typeof entry === 'string' ? entry : entry.tableName || entry.table_name).toLowerCase() === tableName.toLowerCase()
		));
		const describeIfExists = (tableName) => tableExists(tableName) ? queryInterface.describeTable(tableName) : null;

		const clinicalEncounters = await describeIfExists('clinical_encounters');
		if (clinicalEncounters) {
			// Remove indexes first
			const indexes = await queryInterface.showIndex('clinical_encounters');
			if (indexes.some((index) => index.name === 'idx_clinical_encounters_jitsi_room_id')) {
				await queryInterface.removeIndex('clinical_encounters', 'idx_clinical_encounters_jitsi_room_id');
			}
			if (indexes.some((index) => index.name === 'idx_clinical_encounters_duration_minutes')) {
				await queryInterface.removeIndex('clinical_encounters', 'idx_clinical_encounters_duration_minutes');
			}

			// Remove columns
			const removeColumns = ['duration_minutes', 'jitsi_room_id', 'jitsi_room_enabled', 'preparation_notes'];
			for (const columnName of removeColumns) {
				if (clinicalEncounters[columnName]) {
					await queryInterface.removeColumn('clinical_encounters', columnName);
				}
			}
		}
	},
};
