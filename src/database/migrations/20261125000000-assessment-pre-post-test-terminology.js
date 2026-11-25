'use strict';

const { Op } = require('sequelize');

// Standardizes assessment terminology:
//   criteria  -> pre_test   (PRETEST quiz stage)
//   theory    -> post_test  (POST_TEST quiz stage)
// Passing-rule thresholds are renamed to *_threshold and quiz uniqueness per
// thematic area is scoped by assessment_stage so a thematic area can have both
// a pre-test and a post-test quiz. All changes preserve existing data.
module.exports = {
	async up(queryInterface, Sequelize) {
		const assessments = await queryInterface.describeTable('assessments');
		const assessmentColumns = [
			['pre_test_score', { type: Sequelize.FLOAT, allowNull: true }],
			['pre_test_passed', { type: Sequelize.BOOLEAN, allowNull: true }],
			['pre_test_quiz_id', { type: Sequelize.INTEGER, allowNull: true }],
			['pre_test_quiz_attempt_id', { type: Sequelize.INTEGER, allowNull: true }],
			['pre_test_synced_at', { type: Sequelize.DATE, allowNull: true }],
			['post_test_score', { type: Sequelize.FLOAT, allowNull: true }],
			['post_test_passed', { type: Sequelize.BOOLEAN, allowNull: true }],
			['post_test_quiz_id', { type: Sequelize.INTEGER, allowNull: true }],
			['post_test_quiz_attempt_id', { type: Sequelize.INTEGER, allowNull: true }],
			['post_test_synced_at', { type: Sequelize.DATE, allowNull: true }],
			['passing_rule_id', { type: Sequelize.INTEGER, allowNull: true }],
			['passing_rule_snapshot', { type: Sequelize.JSON, allowNull: true }],
			['practical_checklist_id', { type: Sequelize.INTEGER, allowNull: true }],
			['practical_checklist_version', { type: Sequelize.INTEGER, allowNull: true }],
		];
		for (const [name, definition] of assessmentColumns) {
			if (!assessments[name]) await queryInterface.addColumn('assessments', name, definition);
		}

		// Backfill post-test fields from the legacy theory columns. The legacy
		// theory score was quiz-derived, so the mapping is verified.
		if (assessments.theory_score) {
			await queryInterface.sequelize.query(
				'UPDATE assessments SET post_test_score = theory_score WHERE post_test_score IS NULL AND theory_score IS NOT NULL'
			);
		}
		if (assessments.theory_passed) {
			await queryInterface.sequelize.query(
				'UPDATE assessments SET post_test_passed = theory_passed WHERE post_test_passed IS NULL AND theory_passed IS NOT NULL'
			);
		}

		// Rename passing-rule threshold columns, preserving all values.
		const rules = await queryInterface.describeTable('assessment_passing_rules');
		const renames = [
			['criteria_min_score', 'pre_test_threshold'],
			['theory_min_score', 'post_test_threshold'],
			['practical_min_score', 'practical_threshold'],
		];
		for (const [from, to] of renames) {
			if (rules[from] && !rules[to]) {
				await queryInterface.renameColumn('assessment_passing_rules', from, to);
			}
		}

		// Standardize quiz assessment_component values to pre_test/post_test.
		await queryInterface.sequelize.query(
			"UPDATE quizzes SET assessment_component = 'pre_test' WHERE assessment_component = 'criteria'"
		);
		await queryInterface.sequelize.query(
			"UPDATE quizzes SET assessment_component = 'post_test' WHERE assessment_component = 'theory'"
		);

		// Allow multiple quizzes per thematic area as long as they target
		// different assessment stages (pre-test vs post-test).
		const indexes = await queryInterface.showIndex('quizzes').catch(() => []);
		const hasUniqueAreaIndex = indexes.some((entry) => entry.name === 'uq_quizzes_active_thematic_area');
		if (hasUniqueAreaIndex) {
			await queryInterface.removeIndex('quizzes', 'uq_quizzes_active_thematic_area');
		}
		const hasStageIndex = indexes.some((entry) => entry.name === 'uq_quizzes_thematic_area_stage');
		if (!hasStageIndex) {
			await queryInterface.addIndex('quizzes', ['thematic_area_id', 'assessment_stage'], {
				unique: true,
				name: 'uq_quizzes_thematic_area_stage',
				where: {
					thematic_area_id: { [Op.ne]: null },
					assessment_stage: { [Op.ne]: null },
				},
			});
		}
	},

	async down(queryInterface) {
		const indexes = await queryInterface.showIndex('quizzes').catch(() => []);
		if (indexes.some((entry) => entry.name === 'uq_quizzes_thematic_area_stage')) {
			await queryInterface.removeIndex('quizzes', 'uq_quizzes_thematic_area_stage');
		}
		await queryInterface.addIndex('quizzes', ['thematic_area_id'], {
			unique: true,
			name: 'uq_quizzes_active_thematic_area',
			where: { thematic_area_id: { [Op.ne]: null } },
		}).catch(() => {});

		const rules = await queryInterface.describeTable('assessment_passing_rules');
		const renames = [
			['pre_test_threshold', 'criteria_min_score'],
			['post_test_threshold', 'theory_min_score'],
			['practical_threshold', 'practical_min_score'],
		];
		for (const [from, to] of renames) {
			if (rules[from] && !rules[to]) {
				await queryInterface.renameColumn('assessment_passing_rules', from, to);
			}
		}

		const assessments = await queryInterface.describeTable('assessments');
		for (const name of [
			'practical_checklist_version', 'practical_checklist_id',
			'passing_rule_snapshot', 'passing_rule_id',
			'post_test_synced_at', 'post_test_quiz_attempt_id', 'post_test_quiz_id', 'post_test_passed', 'post_test_score',
			'pre_test_synced_at', 'pre_test_quiz_attempt_id', 'pre_test_quiz_id', 'pre_test_passed', 'pre_test_score',
		]) {
			if (assessments[name]) await queryInterface.removeColumn('assessments', name);
		}
	},
};
