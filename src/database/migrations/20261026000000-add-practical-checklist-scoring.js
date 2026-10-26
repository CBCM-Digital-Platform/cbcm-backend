module.exports = {
	up: async (queryInterface, Sequelize) => {
		// Add score column (0-4 integer) to assessment_checklist_items
		await queryInterface.addColumn('assessment_checklist_items', 'score', {
			type: Sequelize.INTEGER,
			allowNull: true,
			default: null,
		});

		// Add required column (boolean) to assessment_checklist_items
		await queryInterface.addColumn('assessment_checklist_items', 'required', {
			type: Sequelize.BOOLEAN,
			allowNull: false,
			defaultValue: false,
		});

		// Add index on required column for filtering
		await queryInterface.addIndex('assessment_checklist_items', ['required'], {
			name: 'idx_assessment_checklist_items_required',
		});

		// Add check constraint to enforce score range 0-4
		await queryInterface.addConstraint('assessment_checklist_items', {
			fields: ['score'],
			type: 'check',
			name: 'ck_assessment_checklist_items_score_range',
			where: {
				[Sequelize.Op.or]: [
					{ score: null },
					{ [Sequelize.Op.and]: [{ score: { [Sequelize.Op.gte]: 0 } }, { score: { [Sequelize.Op.lte]: 4 } }] },
				],
			},
		});

		// Add practical_passed column to assessments
		await queryInterface.addColumn('assessments', 'practical_passed', {
			type: Sequelize.BOOLEAN,
			allowNull: true,
			default: null,
		});
	},

	down: async (queryInterface, Sequelize) => {
		// Remove practical_passed column from assessments
		await queryInterface.removeColumn('assessments', 'practical_passed');

		// Remove check constraint
		await queryInterface.removeConstraint('assessment_checklist_items', 'ck_assessment_checklist_items_score_range');

		// Remove index
		await queryInterface.removeIndex('assessment_checklist_items', 'idx_assessment_checklist_items_required');

		// Remove columns
		await queryInterface.removeColumn('assessment_checklist_items', 'required');
		await queryInterface.removeColumn('assessment_checklist_items', 'score');
	},
};
