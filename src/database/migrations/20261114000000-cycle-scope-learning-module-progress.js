'use strict';

const TABLE = 'learning_module_progress';
const CYCLE_INDEX = 'uq_learning_module_progress_mentee_module_cycle';
const CYCLE_CONSTRAINT = 'fk_learning_module_progress_cycle';

module.exports = {
	async up(queryInterface, Sequelize) {
		const columns = await queryInterface.describeTable(TABLE);
		if (!columns.cycle_id) {
			await queryInterface.addColumn(TABLE, 'cycle_id', {
				type: Sequelize.INTEGER,
				allowNull: true,
			});
		}

		const indexes = await queryInterface.showIndex(TABLE);
		for (const index of indexes) {
			const fields = index.fields.map((field) => field.attribute || field.name).join(',');
			if (index.unique && fields === 'mentee_id,module_id') {
				await queryInterface.removeIndex(TABLE, index.name);
			}
		}

		const constraints = await queryInterface.showConstraint(TABLE);
		if (!constraints.some((constraint) => constraint.constraintName === CYCLE_CONSTRAINT)) {
			await queryInterface.addConstraint(TABLE, {
				fields: ['cycle_id'],
				type: 'foreign key',
				name: CYCLE_CONSTRAINT,
				references: { table: 'mentorship_cycles', field: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'RESTRICT',
			});
		}

		const refreshedIndexes = await queryInterface.showIndex(TABLE);
		if (!refreshedIndexes.some((index) => index.unique && (
			index.fields.map((field) => field.attribute || field.name).join(',') === 'mentee_id,module_id,cycle_id'
		))) {
			await queryInterface.addIndex(TABLE, ['mentee_id', 'module_id', 'cycle_id'], {
				unique: true,
				name: CYCLE_INDEX,
			});
		}
	},

	async down() {
		throw new Error('This progress migration is intentionally irreversible to preserve cycle-scoped learner history.');
	},
};
