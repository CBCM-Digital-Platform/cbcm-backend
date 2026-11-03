module.exports = {
	up: async (queryInterface, Sequelize) => {
		const table = await queryInterface.describeTable('quizzes').catch(() => null);
		if (!table) return;
		if (!Object.prototype.hasOwnProperty.call(table, 'assessment_component')) {
			await queryInterface.addColumn('quizzes', 'assessment_component', {
				type: Sequelize.STRING,
				allowNull: true,
				defaultValue: null,
			});
		}
	},

	down: async (queryInterface) => {
		const table = await queryInterface.describeTable('quizzes').catch(() => null);
		if (table && Object.prototype.hasOwnProperty.call(table, 'assessment_component')) {
			await queryInterface.removeColumn('quizzes', 'assessment_component');
		}
	},
};
