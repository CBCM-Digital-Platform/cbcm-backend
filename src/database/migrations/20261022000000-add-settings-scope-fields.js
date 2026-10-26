module.exports = {
	up: async (queryInterface, Sequelize) => {
		// Add target_audience to faqs table
		await queryInterface.addColumn('faqs', 'target_audience', {
			type: Sequelize.STRING,
			allowNull: true,
		});

		// Add facility_id to faqs table
		await queryInterface.addColumn('faqs', 'facility_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});

		// Add facility_id to user_guides table
		await queryInterface.addColumn('user_guides', 'facility_id', {
			type: Sequelize.INTEGER,
			allowNull: true,
		});

		// Add index on faqs.target_audience
		await queryInterface.addIndex('faqs', ['target_audience'], {
			name: 'idx_faqs_target_audience',
		});

		// Add index on faqs.facility_id
		await queryInterface.addIndex('faqs', ['facility_id'], {
			name: 'idx_faqs_facility_id',
		});

		// Add index on user_guides.facility_id
		await queryInterface.addIndex('user_guides', ['facility_id'], {
			name: 'idx_user_guides_facility_id',
		});

		// Add foreign key constraint for faqs.facility_id
		await queryInterface.addConstraint('faqs', {
			fields: ['facility_id'],
			type: 'foreign key',
			name: 'fk_faqs_facility_id_facilities',
			references: {
				table: 'facilities',
				field: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});

		// Add foreign key constraint for user_guides.facility_id
		await queryInterface.addConstraint('user_guides', {
			fields: ['facility_id'],
			type: 'foreign key',
			name: 'fk_user_guides_facility_id_facilities',
			references: {
				table: 'facilities',
				field: 'id',
			},
			onDelete: 'SET NULL',
			onUpdate: 'CASCADE',
		});
	},

	down: async (queryInterface) => {
		// Remove foreign key constraints
		await queryInterface.removeConstraint('faqs', 'fk_faqs_facility_id_facilities');
		await queryInterface.removeConstraint('user_guides', 'fk_user_guides_facility_id_facilities');

		// Remove indexes
		await queryInterface.removeIndex('faqs', 'idx_faqs_target_audience');
		await queryInterface.removeIndex('faqs', 'idx_faqs_facility_id');
		await queryInterface.removeIndex('user_guides', 'idx_user_guides_facility_id');

		// Remove columns
		await queryInterface.removeColumn('faqs', 'facility_id');
		await queryInterface.removeColumn('faqs', 'target_audience');
		await queryInterface.removeColumn('user_guides', 'facility_id');
	},
};
