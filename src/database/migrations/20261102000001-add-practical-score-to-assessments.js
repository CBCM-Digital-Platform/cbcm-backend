module.exports = {
	up: async (queryInterface, Sequelize) => {
		// Add practical_score field for 1-5 scale practical assessment
		await queryInterface.addColumn('assessments', 'practical_score', {
			type: Sequelize.INTEGER,
			allowNull: true,
			defaultValue: null,
		});

		// Add practical_assessed_by to track who assessed
		await queryInterface.addColumn('assessments', 'practical_assessed_by', {
			type: Sequelize.INTEGER,
			allowNull: true,
			defaultValue: null,
		});

		// Add practical_assessed_at for when assessment was done
		await queryInterface.addColumn('assessments', 'practical_assessed_at', {
			type: Sequelize.DATE,
			allowNull: true,
			defaultValue: null,
		});

		// Add practical_feedback for mentor comments
		await queryInterface.addColumn('assessments', 'practical_feedback', {
			type: Sequelize.TEXT,
			allowNull: true,
			defaultValue: null,
		});

		// Add foreign key constraint for practical_assessed_by
		await queryInterface.addConstraint('assessments', {
			fields: ['practical_assessed_by'],
			type: 'foreign key',
			name: 'fk_assessments_practical_assessed_by',
			references: {
				table: 'users',
				field: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});

		// Add index for practical_score
		await queryInterface.addIndex('assessments', ['practical_score'], {
			name: 'idx_assessments_practical_score',
		});
	},

	down: async (queryInterface, Sequelize) => {
		// Remove index
		await queryInterface.removeIndex('assessments', 'idx_assessments_practical_score');

		// Remove foreign key constraint
		await queryInterface.removeConstraint('assessments', 'fk_assessments_practical_assessed_by');

		// Remove columns
		await queryInterface.removeColumn('assessments', 'practical_feedback');
		await queryInterface.removeColumn('assessments', 'practical_assessed_at');
		await queryInterface.removeColumn('assessments', 'practical_assessed_by');
		await queryInterface.removeColumn('assessments', 'practical_score');
	},
};
