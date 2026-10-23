module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.addColumn('resources', 'module_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});

		await queryInterface.addIndex('resources', ['module_id'], {
			name: 'idx_resources_module_id',
		});

		await queryInterface.addConstraint('resources', {
			fields: ['module_id'],
			type: 'foreign key',
			name: 'fk_resources_module_id_learning_modules',
			references: {
				table: 'learning_modules',
				field: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});
	},

	down: async (queryInterface) => {
		try {
			await queryInterface.removeConstraint('resources', 'fk_resources_module_id_learning_modules');
		} catch (error) {
			// Some dialects or testing backends do not support dropping named constraints
		}

		try {
			await queryInterface.removeIndex('resources', 'idx_resources_module_id');
		} catch (error) {
			// Ignore if index removal not supported
		}

		await queryInterface.removeColumn('resources', 'module_id');
	},
};
