module.exports = {
	up: async (queryInterface, Sequelize) => {
		// Add theory_score and theory_passed to assessments for certificate eligibility
		await queryInterface.addColumn('assessments', 'theory_score', {
			type: Sequelize.FLOAT,
			allowNull: true,
			defaultValue: null,
		});

		await queryInterface.addColumn('assessments', 'theory_passed', {
			type: Sequelize.BOOLEAN,
			allowNull: true,
			defaultValue: null,
		});

		// Add index on theory_passed for filtering
		await queryInterface.addIndex('assessments', ['theory_passed'], {
			name: 'idx_assessments_theory_passed',
		});
	},

	down: async (queryInterface, Sequelize) => {
		// Remove index
		await queryInterface.removeIndex('assessments', 'idx_assessments_theory_passed');

		// Remove columns
		await queryInterface.removeColumn('assessments', 'theory_passed');
		await queryInterface.removeColumn('assessments', 'theory_score');
	},
};
