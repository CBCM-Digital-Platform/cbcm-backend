'use strict';

// Practical assessment checklists: Super Admin-managed, versioned templates
// scoped to a thematic area and procedure, plus structured mentor responses
// stored on assessment_checklist_items.
module.exports = {
	async up(queryInterface, Sequelize) {
		const tables = await queryInterface.showAllTables();

		if (!tables.includes('practical_checklists')) {
			await queryInterface.createTable('practical_checklists', {
				id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
				thematic_area_id: { type: Sequelize.INTEGER, allowNull: false },
				procedure: { type: Sequelize.STRING, allowNull: false },
				title: { type: Sequelize.STRING, allowNull: false },
				description: { type: Sequelize.TEXT, allowNull: true },
				version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
				status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'draft' },
				reference_file_id: { type: Sequelize.INTEGER, allowNull: true },
				published_at: { type: Sequelize.DATE, allowNull: true },
				created_by: { type: Sequelize.INTEGER, allowNull: true },
				updated_by: { type: Sequelize.INTEGER, allowNull: true },
				created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
				updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
			});
			await queryInterface.addIndex('practical_checklists', ['thematic_area_id', 'procedure', 'version'], {
				unique: true,
				name: 'uq_practical_checklists_scope_version',
			});
			await queryInterface.addIndex('practical_checklists', ['thematic_area_id', 'status'], {
				name: 'idx_practical_checklists_area_status',
			});
		}

		if (!tables.includes('practical_checklist_items')) {
			await queryInterface.createTable('practical_checklist_items', {
				id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
				checklist_id: { type: Sequelize.INTEGER, allowNull: false },
				item_text: { type: Sequelize.STRING, allowNull: false },
				sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
				is_required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
				is_critical: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
				created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
				updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('CURRENT_TIMESTAMP') },
			});
			await queryInterface.addIndex('practical_checklist_items', ['checklist_id', 'sort_order'], {
				name: 'idx_practical_checklist_items_order',
			});
		}

		const items = await queryInterface.describeTable('assessment_checklist_items');
		const itemColumns = [
			['checklist_item_id', { type: Sequelize.INTEGER, allowNull: true }],
			['response_status', { type: Sequelize.STRING, allowNull: true }],
			['comment', { type: Sequelize.TEXT, allowNull: true }],
			['not_applicable_reason', { type: Sequelize.TEXT, allowNull: true }],
		];
		for (const [name, definition] of itemColumns) {
			if (!items[name]) await queryInterface.addColumn('assessment_checklist_items', name, definition);
		}
	},

	async down(queryInterface) {
		const items = await queryInterface.describeTable('assessment_checklist_items');
		for (const name of ['not_applicable_reason', 'comment', 'response_status', 'checklist_item_id']) {
			if (items[name]) await queryInterface.removeColumn('assessment_checklist_items', name);
		}
		const tables = await queryInterface.showAllTables();
		if (tables.includes('practical_checklist_items')) {
			await queryInterface.dropTable('practical_checklist_items');
		}
		if (tables.includes('practical_checklists')) {
			await queryInterface.dropTable('practical_checklists');
		}
	},
};
