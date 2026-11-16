'use strict';

const { Op } = require('sequelize');

const TABLES = ['quizzes', 'quiz_import_drafts'];
const stageConstraintName = (table) => `ck_${table}_assessment_stage`;

const tableColumns = async (queryInterface, table) => queryInterface.describeTable(table).catch(() => null);

module.exports = {
	async up(queryInterface, Sequelize) {
		for (const table of TABLES) {
			const columns = await tableColumns(queryInterface, table);
			if (!columns) continue;
			if (!columns.assessment_stage) {
				await queryInterface.addColumn(table, 'assessment_stage', {
					type: Sequelize.STRING,
					allowNull: true,
				});
			}
			const constraints = await queryInterface.showConstraint(table);
			const name = stageConstraintName(table);
			if (!constraints.some((constraint) => constraint.constraintName === name)) {
				await queryInterface.addConstraint(table, {
					fields: ['assessment_stage'],
					type: 'check',
					name,
					where: {
						[Op.or]: [
							{ assessment_stage: null },
							{ assessment_stage: { [Op.in]: ['PRETEST', 'POST_TEST'] } },
						],
					},
				});
			}
		}
	},

	async down(queryInterface) {
		for (const table of TABLES) {
			const columns = await tableColumns(queryInterface, table);
			if (!columns) continue;
			const name = stageConstraintName(table);
			const constraints = await queryInterface.showConstraint(table);
			if (constraints.some((constraint) => constraint.constraintName === name)) {
				await queryInterface.removeConstraint(table, name);
			}
			if (columns.assessment_stage) await queryInterface.removeColumn(table, 'assessment_stage');
		}
	},
};
