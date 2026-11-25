module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.createTable('exams', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        title: { type: Sequelize.STRING, allowNull: false },
        description: { type: Sequelize.TEXT },
        stage: { type: Sequelize.STRING, allowNull: false },
        thematic_area_id: { type: Sequelize.INTEGER, allowNull: false },
        cycle_id: { type: Sequelize.INTEGER, allowNull: false },
        version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        total_questions: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
        total_marks: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 0 },
        pass_percentage: { type: Sequelize.FLOAT },
        is_published: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        is_authorized: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        created_by: { type: Sequelize.INTEGER },
        updated_by: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
      }, { transaction });

      await queryInterface.createTable('exam_questions', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        exam_id: { type: Sequelize.INTEGER, allowNull: false },
        question_text: { type: Sequelize.TEXT, allowNull: false },
        question_type: { type: Sequelize.STRING, allowNull: false, defaultValue: 'single_choice' },
        marks: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 1 },
        order_number: { type: Sequelize.INTEGER, allowNull: false },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
      }, { transaction });

      await queryInterface.createTable('exam_options', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        question_id: { type: Sequelize.INTEGER, allowNull: false },
        option_label: { type: Sequelize.STRING(1), allowNull: false },
        option_text: { type: Sequelize.TEXT, allowNull: false },
        is_correct: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
      }, { transaction });

      await queryInterface.createTable('exam_attempts', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        exam_id: { type: Sequelize.INTEGER, allowNull: false },
        mentee_id: { type: Sequelize.INTEGER, allowNull: false },
        attempt_number: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
        status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'IN_PROGRESS' },
        started_at: { type: Sequelize.DATE, allowNull: false },
        submitted_at: { type: Sequelize.DATE },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
      }, { transaction });

      await queryInterface.createTable('exam_answers', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        attempt_id: { type: Sequelize.INTEGER, allowNull: false },
        question_id: { type: Sequelize.INTEGER, allowNull: false },
        selected_option_id: { type: Sequelize.INTEGER },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
      }, { transaction });

      await queryInterface.createTable('exam_results', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true, allowNull: false },
        attempt_id: { type: Sequelize.INTEGER, allowNull: false, unique: true },
        exam_id: { type: Sequelize.INTEGER, allowNull: false },
        mentee_id: { type: Sequelize.INTEGER, allowNull: false },
        score: { type: Sequelize.FLOAT, allowNull: false },
        total_marks: { type: Sequelize.FLOAT, allowNull: false },
        percentage: { type: Sequelize.FLOAT, allowNull: false },
        passed: { type: Sequelize.BOOLEAN, allowNull: false },
        evaluated_at: { type: Sequelize.DATE, allowNull: false },
        created_at: { type: Sequelize.DATE },
        updated_at: { type: Sequelize.DATE },
      }, { transaction });

      const fk = async (table, fields, name, referenceTable, onDelete = 'RESTRICT') => {
        await queryInterface.addConstraint(table, {
          fields,
          type: 'foreign key',
          name,
          references: { table: referenceTable, field: 'id' },
          onUpdate: 'CASCADE',
          onDelete,
          transaction,
        });
      };

      await fk('exams', ['thematic_area_id'], 'fk_exams_thematic_area_id_thematic_areas', 'thematic_areas');
      await fk('exams', ['cycle_id'], 'fk_exams_cycle_id_mentorship_cycles', 'mentorship_cycles');
      await fk('exams', ['created_by'], 'fk_exams_created_by_users', 'users', 'SET NULL');
      await fk('exams', ['updated_by'], 'fk_exams_updated_by_users', 'users', 'SET NULL');
      await fk('exam_questions', ['exam_id'], 'fk_exam_questions_exam_id_exams', 'exams');
      await fk('exam_options', ['question_id'], 'fk_exam_options_question_id_exam_questions', 'exam_questions');
      await fk('exam_attempts', ['exam_id'], 'fk_exam_attempts_exam_id_exams', 'exams');
      await fk('exam_attempts', ['mentee_id'], 'fk_exam_attempts_mentee_id_users', 'users');
      await fk('exam_answers', ['attempt_id'], 'fk_exam_answers_attempt_id_exam_attempts', 'exam_attempts');
      await fk('exam_answers', ['question_id'], 'fk_exam_answers_question_id_exam_questions', 'exam_questions');
      await fk('exam_answers', ['selected_option_id'], 'fk_exam_answers_selected_option_id_exam_options', 'exam_options');
      await fk('exam_results', ['attempt_id'], 'fk_exam_results_attempt_id_exam_attempts', 'exam_attempts');
      await fk('exam_results', ['exam_id'], 'fk_exam_results_exam_id_exams', 'exams');
      await fk('exam_results', ['mentee_id'], 'fk_exam_results_mentee_id_users', 'users');

      await queryInterface.addIndex('exams', ['thematic_area_id', 'cycle_id', 'stage', 'version'], {
        unique: true, name: 'uq_exams_scope_stage_version', transaction,
      });
      await queryInterface.addIndex('exam_questions', ['exam_id', 'order_number'], {
        unique: true, name: 'uq_exam_questions_exam_order', transaction,
      });
      await queryInterface.addIndex('exam_options', ['question_id', 'option_label'], {
        unique: true, name: 'uq_exam_options_question_label', transaction,
      });
      await queryInterface.addIndex('exam_options', ['question_id'], {
        unique: true, where: { is_correct: true }, name: 'uq_exam_options_one_correct', transaction,
      });
      await queryInterface.addIndex('exam_attempts', ['exam_id', 'mentee_id', 'attempt_number'], {
        unique: true, name: 'uq_exam_attempts_exam_mentee_number', transaction,
      });
      await queryInterface.addIndex('exam_answers', ['attempt_id', 'question_id'], {
        unique: true, name: 'uq_exam_answers_attempt_question', transaction,
      });
      await queryInterface.addIndex('exam_results', ['exam_id', 'mentee_id'], {
        name: 'idx_exam_results_exam_mentee', transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      const constraints = [
        ['exam_results', 'fk_exam_results_mentee_id_users'],
        ['exam_results', 'fk_exam_results_exam_id_exams'],
        ['exam_results', 'fk_exam_results_attempt_id_exam_attempts'],
        ['exam_answers', 'fk_exam_answers_selected_option_id_exam_options'],
        ['exam_answers', 'fk_exam_answers_question_id_exam_questions'],
        ['exam_answers', 'fk_exam_answers_attempt_id_exam_attempts'],
        ['exam_attempts', 'fk_exam_attempts_mentee_id_users'],
        ['exam_attempts', 'fk_exam_attempts_exam_id_exams'],
        ['exam_options', 'fk_exam_options_question_id_exam_questions'],
        ['exam_questions', 'fk_exam_questions_exam_id_exams'],
        ['exams', 'fk_exams_updated_by_users'],
        ['exams', 'fk_exams_created_by_users'],
        ['exams', 'fk_exams_cycle_id_mentorship_cycles'],
        ['exams', 'fk_exams_thematic_area_id_thematic_areas'],
      ];
      for (const [table, name] of constraints) {
        await queryInterface.removeConstraint(table, name, { transaction });
      }
      for (const [table, name] of [
        ['exam_results', 'idx_exam_results_exam_mentee'],
        ['exam_answers', 'uq_exam_answers_attempt_question'],
        ['exam_attempts', 'uq_exam_attempts_exam_mentee_number'],
        ['exam_options', 'uq_exam_options_question_label'],
        ['exam_options', 'uq_exam_options_one_correct'],
        ['exam_questions', 'uq_exam_questions_exam_order'],
        ['exams', 'uq_exams_scope_stage_version'],
      ]) {
        await queryInterface.removeIndex(table, name, { transaction });
      }
      await queryInterface.dropTable('exam_results', { transaction });
      await queryInterface.dropTable('exam_answers', { transaction });
      await queryInterface.dropTable('exam_attempts', { transaction });
      await queryInterface.dropTable('exam_options', { transaction });
      await queryInterface.dropTable('exam_questions', { transaction });
      await queryInterface.dropTable('exams', { transaction });
    });
  },
};
