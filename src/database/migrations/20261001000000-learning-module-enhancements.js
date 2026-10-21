'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableNames = await queryInterface.showAllTables();
    const tableExists = (tableName) => tableNames.some((entry) => (
      String(typeof entry === 'string' ? entry : entry.tableName || entry.table_name).toLowerCase() === tableName.toLowerCase()
    ));
    const describeIfExists = (tableName) => tableExists(tableName) ? queryInterface.describeTable(tableName) : null;

    const learningModules = await describeIfExists('learning_modules');
    if (learningModules) {
      const addColumns = [
        ['description', { type: Sequelize.TEXT, allowNull: true }],
        ['status', { type: Sequelize.STRING, allowNull: true, defaultValue: 'draft' }],
        ['order_number', { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 }],
        ['is_published', { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false }],
        ['estimated_duration_minutes', { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 }],
      ];
      for (const [columnName, options] of addColumns) {
        if (!learningModules[columnName]) {
          await queryInterface.addColumn('learning_modules', columnName, options);
        }
      }
    }

    const learningProgress = await describeIfExists('learning_module_progress');
    if (learningProgress) {
      const addColumns = [
        ['completion_percentage', { type: Sequelize.FLOAT, allowNull: true, defaultValue: 0 }],
        ['last_accessed_at', { type: Sequelize.DATE, allowNull: true }],
      ];
      for (const [columnName, options] of addColumns) {
        if (!learningProgress[columnName]) {
          await queryInterface.addColumn('learning_module_progress', columnName, options);
        }
      }
    }

    const quizzes = await describeIfExists('quizzes');
    if (quizzes) {
      const addColumns = [
        ['description', { type: Sequelize.TEXT, allowNull: true }],
        ['pass_score', { type: Sequelize.FLOAT, allowNull: true, defaultValue: 0 }],
        ['time_limit_minutes', { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 }],
        ['attempt_limit', { type: Sequelize.INTEGER, allowNull: true, defaultValue: 1 }],
        ['updated_at', { type: Sequelize.DATE, allowNull: true }],
      ];
      for (const [columnName, options] of addColumns) {
        if (!quizzes[columnName]) {
          await queryInterface.addColumn('quizzes', columnName, options);
        }
      }
    }

    const quizQuestions = await describeIfExists('quiz_questions');
    if (quizQuestions) {
      const addColumns = [
        ['question_type', { type: Sequelize.STRING, allowNull: true, defaultValue: 'single_choice' }],
        ['points', { type: Sequelize.FLOAT, allowNull: true, defaultValue: 1 }],
        ['explanation', { type: Sequelize.TEXT, allowNull: true }],
        ['order_number', { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 }],
        ['created_at', { type: Sequelize.DATE, allowNull: true }],
        ['updated_at', { type: Sequelize.DATE, allowNull: true }],
      ];
      for (const [columnName, options] of addColumns) {
        if (!quizQuestions[columnName]) {
          await queryInterface.addColumn('quiz_questions', columnName, options);
        }
      }
    }

    const quizQuestionOptions = await describeIfExists('quiz_question_options');
    if (quizQuestionOptions) {
      const addColumns = [
        ['order_number', { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 }],
        ['created_at', { type: Sequelize.DATE, allowNull: true }],
        ['updated_at', { type: Sequelize.DATE, allowNull: true }],
      ];
      for (const [columnName, options] of addColumns) {
        if (!quizQuestionOptions[columnName]) {
          await queryInterface.addColumn('quiz_question_options', columnName, options);
        }
      }
    }

    const quizAttempts = await describeIfExists('quiz_attempts');
    if (quizAttempts) {
      const addColumns = [
        ['attempt_number', { type: Sequelize.INTEGER, allowNull: true, defaultValue: 1 }],
        ['status', { type: Sequelize.STRING, allowNull: true, defaultValue: 'in_progress' }],
        ['started_at', { type: Sequelize.DATE, allowNull: true }],
        ['completed_at', { type: Sequelize.DATE, allowNull: true }],
        ['ended_at', { type: Sequelize.DATE, allowNull: true }],
        ['created_at', { type: Sequelize.DATE, allowNull: true }],
        ['updated_at', { type: Sequelize.DATE, allowNull: true }],
      ];
      for (const [columnName, options] of addColumns) {
        if (!quizAttempts[columnName]) {
          await queryInterface.addColumn('quiz_attempts', columnName, options);
        }
      }
    }

    const quizAttemptAnswers = await describeIfExists('quiz_attempt_answers');
    if (quizAttemptAnswers) {
      const addColumns = [
        ['points_awarded', { type: Sequelize.FLOAT, allowNull: true, defaultValue: 0 }],
        ['created_at', { type: Sequelize.DATE, allowNull: true }],
        ['updated_at', { type: Sequelize.DATE, allowNull: true }],
      ];
      for (const [columnName, options] of addColumns) {
        if (!quizAttemptAnswers[columnName]) {
          await queryInterface.addColumn('quiz_attempt_answers', columnName, options);
        }
      }
    }

    const contentsTable = await describeIfExists('learning_module_contents');
    if (!contentsTable) {
      await queryInterface.createTable('learning_module_contents', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        module_id: { type: Sequelize.INTEGER, allowNull: false },
        title: { type: Sequelize.STRING, allowNull: false },
        type: { type: Sequelize.STRING, allowNull: true, defaultValue: 'article' },
        content_text: { type: Sequelize.TEXT, allowNull: true },
        content_url: { type: Sequelize.STRING, allowNull: true },
        order_number: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        is_required: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: true },
        duration_minutes: { type: Sequelize.INTEGER, allowNull: true, defaultValue: 0 },
        created_by: { type: Sequelize.INTEGER, allowNull: true },
        updated_by: { type: Sequelize.INTEGER, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: true },
        updated_at: { type: Sequelize.DATE, allowNull: true },
      });
    }
  },

  async down() {
    throw new Error('This Learning migration is intentionally irreversible to preserve learner content and progress data.');
  },
};
