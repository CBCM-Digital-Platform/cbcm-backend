const { Op } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    const quiz = await queryInterface.describeTable('quizzes');
    if (!quiz.thematic_area_id) await queryInterface.addColumn('quizzes', 'thematic_area_id', { type: Sequelize.INTEGER, allowNull: true });
    if (quiz.module_id && quiz.module_id.allowNull === false) await queryInterface.changeColumn('quizzes', 'module_id', { type: Sequelize.INTEGER, allowNull: true });

    const constraints = await queryInterface.showConstraint('quizzes').catch(() => []);
    if (!constraints.some((entry) => entry.constraintName === 'fk_quizzes_thematic_area_id_thematic_areas')) {
      await queryInterface.addConstraint('quizzes', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_quizzes_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
    }

    await queryInterface.addIndex('quizzes', ['thematic_area_id'], {
      unique: true,
      name: 'uq_quizzes_active_thematic_area',
      where: { thematic_area_id: { [Op.ne]: null } },
    });

    const draft = await queryInterface.describeTable('quiz_import_drafts').catch(() => null);
    if (draft) {
      if (!draft.thematic_area_id) await queryInterface.addColumn('quiz_import_drafts', 'thematic_area_id', { type: Sequelize.INTEGER, allowNull: true });
      if (draft.module_id && draft.module_id.allowNull === false) await queryInterface.changeColumn('quiz_import_drafts', 'module_id', { type: Sequelize.INTEGER, allowNull: true });
      const constraints = await queryInterface.showConstraint('quiz_import_drafts').catch(() => []);
      if (!constraints.some((entry) => entry.constraintName === 'fk_quiz_import_drafts_thematic_area_id_thematic_areas')) {
        await queryInterface.addConstraint('quiz_import_drafts', { fields: ['thematic_area_id'], type: 'foreign key', name: 'fk_quiz_import_drafts_thematic_area_id_thematic_areas', references: { table: 'thematic_areas', field: 'id' } });
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('quizzes', 'uq_quizzes_active_thematic_area').catch(() => {});
    await queryInterface.removeConstraint('quizzes', 'fk_quizzes_thematic_area_id_thematic_areas').catch(() => {});
    await queryInterface.removeColumn('quizzes', 'thematic_area_id').catch(() => {});
    await queryInterface.removeConstraint('quiz_import_drafts', 'fk_quiz_import_drafts_thematic_area_id_thematic_areas').catch(() => {});
    await queryInterface.removeColumn('quiz_import_drafts', 'thematic_area_id').catch(() => {});
  },
};
