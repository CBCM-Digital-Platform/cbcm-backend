'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		const tables = await queryInterface.showAllTables();
		const exists = tables.some((entry) => String(typeof entry === 'string' ? entry : entry.tableName || entry.table_name).toLowerCase() === 'quiz_import_drafts');
		if (exists) return;
		await queryInterface.createTable('quiz_import_drafts', {
			id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
			module_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'learning_modules', key: 'id' } },
			question_file_id: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'uploaded_files', key: 'id' } },
			answer_key_file_id: { type: Sequelize.INTEGER, references: { model: 'uploaded_files', key: 'id' } },
			created_by: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' } },
			status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'uploaded' },
			questions: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
			warnings: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
			quiz_id: { type: Sequelize.INTEGER, references: { model: 'quizzes', key: 'id' } },
			confirmed_at: { type: Sequelize.DATE },
			created_at: { type: Sequelize.DATE },
			updated_at: { type: Sequelize.DATE },
		});
		await queryInterface.addIndex('quiz_import_drafts', ['created_by', 'status'], { name: 'idx_quiz_import_drafts_creator_status' });
	},

	async down(queryInterface) {
		await queryInterface.dropTable('quiz_import_drafts');
	},
};
