'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		const contentColumns = await queryInterface.describeTable('learning_module_contents');
		if (!contentColumns.file_id) {
			await queryInterface.addColumn('learning_module_contents', 'file_id', {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'uploaded_files', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			});
		}

		const uploadColumns = await queryInterface.describeTable('uploaded_files');
		if (!uploadColumns.original_name) {
			await queryInterface.addColumn('uploaded_files', 'original_name', {
				type: Sequelize.STRING,
				allowNull: true,
			});
		}
	},

	async down(queryInterface) {
		const contentColumns = await queryInterface.describeTable('learning_module_contents');
		if (contentColumns.file_id) await queryInterface.removeColumn('learning_module_contents', 'file_id');
		const uploadColumns = await queryInterface.describeTable('uploaded_files');
		if (uploadColumns.original_name) await queryInterface.removeColumn('uploaded_files', 'original_name');
	},
};
