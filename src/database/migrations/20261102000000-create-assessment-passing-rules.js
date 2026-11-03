module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.createTable('assessment_passing_rules', {
			id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
			cycle_id: { type: Sequelize.INTEGER, allowNull: true },
			thematic_area_id: { type: Sequelize.INTEGER, allowNull: true },
			criteria_min_score: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 70 },
			theory_min_score: { type: Sequelize.FLOAT, allowNull: false, defaultValue: 80 },
			practical_min_score: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 3 },
			is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
			created_by: { type: Sequelize.INTEGER },
			updated_by: { type: Sequelize.INTEGER },
			created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
			updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
		});

		// Add foreign key constraints
		await queryInterface.addConstraint('assessment_passing_rules', {
			fields: ['cycle_id'],
			type: 'foreign key',
			name: 'fk_assessment_passing_rules_cycle_id',
			references: {
				table: 'mentorship_cycles',
				field: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});

		await queryInterface.addConstraint('assessment_passing_rules', {
			fields: ['thematic_area_id'],
			type: 'foreign key',
			name: 'fk_assessment_passing_rules_thematic_area_id',
			references: {
				table: 'thematic_areas',
				field: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});

		await queryInterface.addConstraint('assessment_passing_rules', {
			fields: ['created_by'],
			type: 'foreign key',
			name: 'fk_assessment_passing_rules_created_by',
			references: {
				table: 'users',
				field: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});

		await queryInterface.addConstraint('assessment_passing_rules', {
			fields: ['updated_by'],
			type: 'foreign key',
			name: 'fk_assessment_passing_rules_updated_by',
			references: {
				table: 'users',
				field: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});

		// Add indexes for efficient lookups
		await queryInterface.addIndex('assessment_passing_rules', ['cycle_id', 'thematic_area_id', 'is_active'], {
			name: 'idx_assessment_passing_rules_scope',
		});

		await queryInterface.addIndex('assessment_passing_rules', ['is_active'], {
			name: 'idx_assessment_passing_rules_active',
		});

		// Insert default system-wide rule
		await queryInterface.bulkInsert('assessment_passing_rules', [{
			cycle_id: null,
			thematic_area_id: null,
			criteria_min_score: 70,
			theory_min_score: 80,
			practical_min_score: 3,
			is_active: true,
			created_by: null,
			updated_by: null,
			created_at: new Date(),
			updated_at: new Date(),
		}]);
	},

	down: async (queryInterface, Sequelize) => {
		// Remove indexes
		await queryInterface.removeIndex('assessment_passing_rules', 'idx_assessment_passing_rules_active');
		await queryInterface.removeIndex('assessment_passing_rules', 'idx_assessment_passing_rules_scope');

		// Remove foreign key constraints
		await queryInterface.removeConstraint('assessment_passing_rules', 'fk_assessment_passing_rules_updated_by');
		await queryInterface.removeConstraint('assessment_passing_rules', 'fk_assessment_passing_rules_created_by');
		await queryInterface.removeConstraint('assessment_passing_rules', 'fk_assessment_passing_rules_thematic_area_id');
		await queryInterface.removeConstraint('assessment_passing_rules', 'fk_assessment_passing_rules_cycle_id');

		// Drop table
		await queryInterface.dropTable('assessment_passing_rules');
	},
};
