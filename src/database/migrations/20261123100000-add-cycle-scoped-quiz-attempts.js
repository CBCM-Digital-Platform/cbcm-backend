const { Op } = require('sequelize');

module.exports = {
	async up(queryInterface, Sequelize) {
		const table = await queryInterface.describeTable('quiz_attempts');
		const columns = [
			['assessment_stage', { type: Sequelize.STRING, allowNull: true }],
			['cycle_id', { type: Sequelize.INTEGER, allowNull: true }],
			['thematic_area_id', { type: Sequelize.INTEGER, allowNull: true }],
			['max_score', { type: Sequelize.FLOAT, allowNull: true }],
			['percentage_score', { type: Sequelize.FLOAT, allowNull: true }],
			['submitted_at', { type: Sequelize.DATE, allowNull: true }],
		];
		for (const [name, definition] of columns) {
			if (!table[name]) await queryInterface.addColumn('quiz_attempts', name, definition);
		}
		const constraints = await queryInterface.showConstraint('quiz_attempts').catch(() => []);
		if (!constraints.some((entry) => entry.constraintName === 'fk_quiz_attempts_cycle_id_mentorship_cycles')) {
			await queryInterface.addConstraint('quiz_attempts', {
				fields: ['cycle_id'], type: 'foreign key', name: 'fk_quiz_attempts_cycle_id_mentorship_cycles',
				references: { table: 'mentorship_cycles', field: 'id' },
			});
		}
		if (!constraints.some((entry) => entry.constraintName === 'fk_quiz_attempts_thematic_area_id_thematic_areas')) {
			await queryInterface.addConstraint('quiz_attempts', {
				fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_quiz_attempts_thematic_area_id_thematic_areas',
				references: { table: 'thematic_areas', field: 'id' },
			});
		}
		await queryInterface.addIndex('quiz_attempts', ['mentee_id', 'quiz_id', 'cycle_id', 'assessment_stage'], {
			unique: true,
			name: 'uq_quiz_attempts_mentee_quiz_cycle_stage',
			where: { cycle_id: { [Op.ne]: null }, assessment_stage: { [Op.ne]: null } },
		}).catch((error) => {
			if (!/already exists/i.test(error.message || '')) throw error;
		});
	},

	async down(queryInterface) {
		await queryInterface.removeIndex('quiz_attempts', 'uq_quiz_attempts_mentee_quiz_cycle_stage').catch(() => {});
		await queryInterface.removeConstraint('quiz_attempts', 'fk_quiz_attempts_thematic_area_id_thematic_areas').catch(() => {});
		await queryInterface.removeConstraint('quiz_attempts', 'fk_quiz_attempts_cycle_id_mentorship_cycles').catch(() => {});
		for (const name of ['submitted_at', 'percentage_score', 'max_score', 'thematic_area_id', 'cycle_id', 'assessment_stage']) {
			await queryInterface.removeColumn('quiz_attempts', name).catch(() => {});
		}
	},
};
