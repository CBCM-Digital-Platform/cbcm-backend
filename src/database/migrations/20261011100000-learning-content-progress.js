'use strict';

module.exports = {
	async up(queryInterface, Sequelize) {
		const quizColumns = await queryInterface.describeTable('quizzes');
		if (!quizColumns.is_published) {
			await queryInterface.addColumn('quizzes', 'is_published', {
				type: Sequelize.BOOLEAN,
				allowNull: false,
				defaultValue: false,
			});
		}

		const tableNames = await queryInterface.showAllTables();
		const tableExists = (tableName) => tableNames.some((entry) => (
			String(typeof entry === 'string' ? entry : entry.tableName || entry.table_name).toLowerCase() === tableName.toLowerCase()
		));
		if (!tableExists('learning_content_progress')) {
			await queryInterface.createTable('learning_content_progress', {
				id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
				mentee_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'users', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'CASCADE',
				},
				module_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'learning_modules', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'CASCADE',
				},
				content_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'learning_module_contents', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'CASCADE',
				},
				completed_at: { type: Sequelize.DATE, allowNull: false },
				created_at: { type: Sequelize.DATE, allowNull: true },
				updated_at: { type: Sequelize.DATE, allowNull: true },
			});
		}

		if (!tableExists('quiz_attempt_answer_options')) {
			await queryInterface.createTable('quiz_attempt_answer_options', {
				id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
				answer_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'quiz_attempt_answers', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'CASCADE',
				},
				option_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: { model: 'quiz_question_options', key: 'id' },
					onUpdate: 'CASCADE',
					onDelete: 'RESTRICT',
				},
				created_at: { type: Sequelize.DATE, allowNull: true },
			});
		}

		const contentConstraints = await queryInterface.showConstraint('learning_module_contents');
		if (!contentConstraints.some((constraint) => constraint.constraintName === 'fk_learning_module_contents_module_id_learning_modules')) {
			await queryInterface.addConstraint('learning_module_contents', {
				fields: ['module_id'],
				type: 'foreign key',
				name: 'fk_learning_module_contents_module_id_learning_modules',
				references: { table: 'learning_modules', field: 'id' },
				onUpdate: 'CASCADE',
				onDelete: 'CASCADE',
			});
		}
		const contentIndexes = await queryInterface.showIndex('learning_module_contents');
		if (!contentIndexes.some((index) => index.fields.map((field) => field.attribute || field.name).join(',') === 'module_id')) {
			await queryInterface.addIndex('learning_module_contents', ['module_id'], {
				name: 'idx_learning_module_contents_module_id',
			});
		}

		const answerOptionIndexes = await queryInterface.showIndex('quiz_attempt_answer_options');
		if (!answerOptionIndexes.some((index) => index.unique && index.fields.map((field) => field.attribute || field.name).join(',') === 'answer_id,option_id')) {
			await queryInterface.addIndex('quiz_attempt_answer_options', ['answer_id', 'option_id'], {
				unique: true,
				name: 'uq_quiz_attempt_answer_options_answer_option',
			});
		}

		const indexes = await queryInterface.showIndex('learning_content_progress');
		if (!indexes.some((index) => index.unique && index.fields.map((field) => field.attribute || field.name).join(',') === 'mentee_id,content_id')) {
			await queryInterface.addIndex('learning_content_progress', ['mentee_id', 'content_id'], {
				unique: true,
				name: 'uq_learning_content_progress_mentee_content',
			});
		}

		const accessIndexes = await queryInterface.showIndex('learning_module_progress');
		if (!accessIndexes.some((index) => index.unique && index.fields.map((field) => field.attribute || field.name).join(',') === 'mentee_id,module_id')) {
			await queryInterface.addIndex('learning_module_progress', ['mentee_id', 'module_id'], {
				unique: true,
				name: 'uq_learning_module_progress_mentee_module',
			});
		}
	},

	async down() {
		throw new Error('This Learning migration is intentionally irreversible to preserve learner progress and quiz publication data.');
	},
};
