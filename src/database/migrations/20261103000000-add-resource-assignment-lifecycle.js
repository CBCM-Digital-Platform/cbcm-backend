const INDEXES = [
	{
		name: 'idx_resource_assignments_mentee_status_assigned',
		fields: ['mentee_id', 'assignment_status', 'assigned_at'],
	},
	{
		name: 'idx_resource_assignments_mentor_resource_status',
		fields: ['mentor_id', 'resource_id', 'assignment_status'],
	},
];

async function getTables(queryInterface) {
	const tables = await queryInterface.showAllTables();
	return new Set(tables.map((table) => (typeof table === 'string' ? table : table.tableName)));
}

async function getIndexes(queryInterface) {
	return queryInterface.showIndex('resource_assignments');
}

module.exports = {
	up: async (queryInterface, Sequelize) => {
		if (!((await getTables(queryInterface)).has('resource_assignments'))) {
			throw new Error('resource_assignments must exist before its lifecycle can be extended.');
		}

		const columns = await queryInterface.describeTable('resource_assignments');
		if (!columns.assignment_status) {
			throw new Error('resource_assignments.assignment_status is required.');
		}

		if (queryInterface.sequelize.getDialect() === 'postgres') {
			const [enumTypes] = await queryInterface.sequelize.query(
				`SELECT namespace.nspname AS schema_name, type.typname AS type_name, type.typtype AS type_kind
				 FROM pg_attribute attribute
				 JOIN pg_class table_record ON table_record.oid = attribute.attrelid
				 JOIN pg_namespace namespace ON namespace.oid = table_record.relnamespace
				 JOIN pg_type type ON type.oid = attribute.atttypid
				 WHERE table_record.relname = 'resource_assignments'
				   AND attribute.attname = 'assignment_status'
				   AND attribute.attnum > 0
				   AND NOT attribute.attisdropped
				   AND namespace.nspname = current_schema()`
			);
			if (enumTypes.length && enumTypes[0].type_kind === 'e') {
				const schema = queryInterface.quoteIdentifier(enumTypes[0].schema_name);
				const type = queryInterface.quoteIdentifier(enumTypes[0].type_name);
				await queryInterface.sequelize.query(
					`ALTER TYPE ${schema}.${type} ADD VALUE IF NOT EXISTS 'completed'`
				);
			} else {
				await queryInterface.changeColumn('resource_assignments', 'assignment_status', {
					type: Sequelize.ENUM('active', 'revoked', 'completed'),
					allowNull: false,
					defaultValue: 'active',
				});
			}
		} else {
			await queryInterface.changeColumn('resource_assignments', 'assignment_status', {
				type: Sequelize.ENUM('active', 'revoked', 'completed'),
				allowNull: false,
				defaultValue: 'active',
			});
		}

		if (!columns.completed_at) {
			await queryInterface.addColumn('resource_assignments', 'completed_at', {
				type: Sequelize.DATE,
				allowNull: true,
			});
		}

		const existingIndexes = await getIndexes(queryInterface);
		for (const index of INDEXES) {
			if (!existingIndexes.some((existing) => existing.name === index.name)) {
				await queryInterface.addIndex('resource_assignments', index.fields, { name: index.name });
			}
		}
	},

	down: async (queryInterface) => {
		if (!((await getTables(queryInterface)).has('resource_assignments'))) return;
		const [rows] = await queryInterface.sequelize.query(
			"SELECT COUNT(*) AS count FROM resource_assignments WHERE assignment_status = 'completed'"
		);
		if (Number(rows[0]?.count || 0) > 0) {
			throw new Error('Cannot roll back resource assignment lifecycle while completed assignment history exists.');
		}

		const columns = await queryInterface.describeTable('resource_assignments');
		if (columns.completed_at) {
			await queryInterface.removeColumn('resource_assignments', 'completed_at');
		}
		const existingIndexes = await getIndexes(queryInterface);
		for (const index of INDEXES) {
			if (existingIndexes.some((existing) => existing.name === index.name)) {
				await queryInterface.removeIndex('resource_assignments', index.name);
			}
		}
	},
};
