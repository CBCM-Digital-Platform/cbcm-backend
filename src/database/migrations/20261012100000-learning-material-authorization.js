'use strict';

const addBooleanColumnIfMissing = async (queryInterface, Sequelize, tableName, columnName) => {
	const columns = await queryInterface.describeTable(tableName);
	if (!columns[columnName]) {
		await queryInterface.addColumn(tableName, columnName, {
			type: Sequelize.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		});
	}
};

module.exports = {
	async up(queryInterface, Sequelize) {
		await addBooleanColumnIfMissing(queryInterface, Sequelize, 'learning_modules', 'is_authorized');
		await addBooleanColumnIfMissing(queryInterface, Sequelize, 'learning_module_contents', 'is_published');
		await addBooleanColumnIfMissing(queryInterface, Sequelize, 'learning_module_contents', 'is_authorized');
		await addBooleanColumnIfMissing(queryInterface, Sequelize, 'quizzes', 'is_authorized');
		const progressColumns = await queryInterface.describeTable('learning_module_progress');
		if (!progressColumns.assigned_by) {
			await queryInterface.addColumn('learning_module_progress', 'assigned_by', {
				type: Sequelize.INTEGER,
				allowNull: true,
				references: { model: 'users', key: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'SET NULL',
			});
		}
		if (!progressColumns.assigned_at) {
			await queryInterface.addColumn('learning_module_progress', 'assigned_at', {
				type: Sequelize.DATE,
				allowNull: true,
			});
		}
	},

	async down(queryInterface) {
		for (const [tableName, columnName] of [
			['learning_module_progress', 'assigned_at'],
			['learning_module_progress', 'assigned_by'],
			['quizzes', 'is_authorized'],
			['learning_module_contents', 'is_authorized'],
			['learning_module_contents', 'is_published'],
			['learning_modules', 'is_authorized'],
		]) {
			const columns = await queryInterface.describeTable(tableName);
			if (columns[columnName]) await queryInterface.removeColumn(tableName, columnName);
		}
	},
};
