const { QueryTypes } = require('sequelize');

const LEGACY_TABLES = [
	['facility_resource_grants', 'legacy_facility_resource_grants_archive'],
	['mentor_resource_grants', 'legacy_mentor_resource_grants_archive'],
	['hierarchical_resources', 'legacy_hierarchical_resources_archive'],
];

async function getTables(queryInterface, transaction) {
	const tables = await queryInterface.showAllTables({ transaction });
	return new Set(tables.map((table) => (typeof table === 'string' ? table : table.tableName)));
}

async function removeForeignKeysTo(queryInterface, tableName, targetTable, transaction) {
	const constraints = await queryInterface.sequelize.query(
		`SELECT c.conname
		 FROM pg_constraint c
		 JOIN pg_class source ON source.oid = c.conrelid
		 JOIN pg_class target ON target.oid = c.confrelid
		 WHERE c.contype = 'f'
		   AND source.relname = :tableName
		   AND target.relname = :targetTable
		   AND source.relnamespace = current_schema()::regnamespace
		   AND target.relnamespace = current_schema()::regnamespace`,
		{
			replacements: { tableName, targetTable },
			type: QueryTypes.SELECT,
			transaction,
		}
	);

	for (const { conname } of constraints) {
		await queryInterface.removeConstraint(tableName, conname, { transaction });
	}
}

async function addResourceAssignmentTable(queryInterface, Sequelize, transaction) {
	await queryInterface.createTable('resource_assignments', {
		id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
		resource_id: {
			type: Sequelize.INTEGER,
			allowNull: false,
			references: { model: 'resources', key: 'id' },
			onDelete: 'RESTRICT',
		},
		mentor_id: {
			type: Sequelize.INTEGER,
			allowNull: false,
			references: { model: 'users', key: 'id' },
			onDelete: 'CASCADE',
		},
		mentee_id: {
			type: Sequelize.INTEGER,
			allowNull: false,
			references: { model: 'users', key: 'id' },
			onDelete: 'CASCADE',
		},
		facility_id: {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'facilities', key: 'id' },
			onDelete: 'SET NULL',
		},
		assignment_status: {
			type: Sequelize.ENUM('active', 'revoked'),
			defaultValue: 'active',
			allowNull: false,
		},
		assigned_by: {
			type: Sequelize.INTEGER,
			allowNull: false,
			references: { model: 'users', key: 'id' },
		},
		assigned_at: { type: Sequelize.DATE, allowNull: false },
		revoked_at: { type: Sequelize.DATE, allowNull: true },
		revoked_by: {
			type: Sequelize.INTEGER,
			allowNull: true,
			references: { model: 'users', key: 'id' },
		},
		learning_note: { type: Sequelize.TEXT, allowNull: true },
	}, { transaction });

	await queryInterface.addIndex('resource_assignments', ['resource_id', 'mentee_id'], {
		name: 'idx_resource_assignments_active_unique',
		unique: true,
		where: { assignment_status: 'active' },
		transaction,
	});
	for (const column of ['mentor_id', 'mentee_id', 'resource_id', 'facility_id']) {
		await queryInterface.addIndex('resource_assignments', [column], { transaction });
	}
}

module.exports = {
	up: async (queryInterface, Sequelize) => {
		await queryInterface.sequelize.transaction(async (transaction) => {
			let tables = await getTables(queryInterface, transaction);
			const tablePairs = [
				['hierarchical_resources', 'legacy_hierarchical_resources_archive'],
				['facility_resource_grants', 'legacy_facility_resource_grants_archive'],
				['mentor_resource_grants', 'legacy_mentor_resource_grants_archive'],
			];

			for (const [source, archive] of tablePairs) {
				if (tables.has(source) && tables.has(archive)) {
					throw new Error(`Both ${source} and ${archive} exist; refusing to guess which data is authoritative.`);
				}
			}
			if (
				!tables.has('hierarchical_resources')
				&& !tables.has('legacy_hierarchical_resources_archive')
				&& (tables.has('facility_resource_grants') || tables.has('mentor_resource_grants'))
			) {
				throw new Error('Legacy resource grants exist without their hierarchical resources; refusing to orphan the grant history.');
			}
			if (tables.has('mentee_resource_assignments') && tables.has('resource_assignments')) {
				throw new Error('Both mentee_resource_assignments and resource_assignments exist; refusing to merge assignment history implicitly.');
			}

			const resourceColumns = await queryInterface.describeTable('resources', { transaction });
			if (!resourceColumns.legacy_hierarchical_resource_id) {
				await queryInterface.addColumn('resources', 'legacy_hierarchical_resource_id', {
					type: Sequelize.INTEGER,
					allowNull: true,
				}, { transaction });
			}
			const resourceIndexes = await queryInterface.showIndex('resources', { transaction });
			const hasLegacyResourceIndex = resourceIndexes.some((index) => index.unique
				&& index.fields.map((field) => field.attribute || field.name).join(',') === 'legacy_hierarchical_resource_id');
			if (!hasLegacyResourceIndex) {
				await queryInterface.addIndex('resources', ['legacy_hierarchical_resource_id'], {
					name: 'uq_resources_legacy_hierarchical_resource_id',
					unique: true,
					transaction,
				});
			}

			if (tables.has('hierarchical_resources')) {
				if (!tables.has('resources')) {
					throw new Error('Cannot migrate hierarchical resources because the regular resources table is missing.');
				}

				const unknownReferences = await queryInterface.sequelize.query(
					`SELECT source.relname AS table_name, c.conname AS constraint_name
					 FROM pg_constraint c
					 JOIN pg_class source ON source.oid = c.conrelid
					 JOIN pg_class target ON target.oid = c.confrelid
					 WHERE c.contype = 'f' AND target.relname = 'hierarchical_resources'
					   AND target.relnamespace = current_schema()::regnamespace
					   AND source.relname NOT IN (
					     'facility_resource_grants', 'mentor_resource_grants', 'mentee_resource_assignments'
					   )`,
					{ type: QueryTypes.SELECT, transaction }
				);
				if (unknownReferences.length) {
					throw new Error(`Unexpected foreign keys reference hierarchical_resources: ${unknownReferences.map((row) => `${row.table_name}.${row.constraint_name}`).join(', ')}.`);
				}

				await queryInterface.sequelize.query(
					`CREATE TEMP TABLE _hierarchical_resource_migration_map ON COMMIT DROP AS
					 SELECT h.id AS legacy_id,
					        nextval(pg_get_serial_sequence('resources', 'id'))::integer AS resource_id
					 FROM hierarchical_resources h
					 WHERE NOT EXISTS (
					   SELECT 1 FROM resources r WHERE r.legacy_hierarchical_resource_id = h.id
					 )
					 ORDER BY h.id`,
					{ transaction }
				);
				await queryInterface.sequelize.query(
					`INSERT INTO resources
					   (id, title, type, file_id, created_by, updated_by, created_at, updated_at, legacy_hierarchical_resource_id)
					 SELECT map.resource_id, h.title, h.type, h.uploaded_file_id, h.created_by, h.updated_by,
					        h.created_at, h.updated_at, h.id
					 FROM hierarchical_resources h
					 JOIN _hierarchical_resource_migration_map map ON map.legacy_id = h.id`,
					{ transaction }
				);
			}

			tables = await getTables(queryInterface, transaction);
			if (tables.has('mentee_resource_assignments')) {
				if (!tables.has('hierarchical_resources')) {
					throw new Error('Cannot migrate mentee resource assignments because their hierarchical resource records are missing.');
				}

				const unmapped = await queryInterface.sequelize.query(
					`SELECT count(*)::integer AS count
					 FROM mentee_resource_assignments assignment
					 LEFT JOIN resources resource ON resource.legacy_hierarchical_resource_id = assignment.resource_id
					 WHERE resource.id IS NULL`,
					{ type: QueryTypes.SELECT, transaction }
				);
				if (Number(unmapped[0].count) > 0) {
					throw new Error(`${unmapped[0].count} mentee resource assignments have no regular Resource mapping.`);
				}

				await removeForeignKeysTo(queryInterface, 'mentee_resource_assignments', 'hierarchical_resources', transaction);
				await queryInterface.sequelize.query(
					`UPDATE mentee_resource_assignments assignment
					 SET resource_id = resource.id
					 FROM resources resource
					 WHERE resource.legacy_hierarchical_resource_id = assignment.resource_id`,
					{ transaction }
				);
				await queryInterface.renameTable('mentee_resource_assignments', 'resource_assignments', { transaction });
				await queryInterface.addConstraint('resource_assignments', {
					fields: ['resource_id'],
					type: 'foreign key',
					name: 'fk_resource_assignments_resource_id_resources',
					references: { table: 'resources', field: 'id' },
					onDelete: 'RESTRICT',
					transaction,
				});
			} else if (!tables.has('resource_assignments')) {
				await addResourceAssignmentTable(queryInterface, Sequelize, transaction);
			}

			for (const [source, archive] of LEGACY_TABLES) {
				tables = await getTables(queryInterface, transaction);
				if (tables.has(source)) {
					await queryInterface.renameTable(source, archive, { transaction });
				}
			}
		});
	},

	down: async (queryInterface) => {
		await queryInterface.sequelize.transaction(async (transaction) => {
			const tables = await getTables(queryInterface, transaction);
			if (tables.has('legacy_hierarchical_resources_archive')) {
				throw new Error('Legacy resource archive data prevents automatic rollback; restore it from the archive tables and a database backup.');
			}

			if (tables.has('resource_assignments')) {
				const [{ count }] = await queryInterface.sequelize.query(
					'SELECT count(*) AS count FROM resource_assignments',
					{ type: QueryTypes.SELECT, transaction }
				);
				if (Number(count) > 0) {
					throw new Error('Resource assignment history prevents automatic rollback; preserve the rows before reverting this migration.');
				}
				await queryInterface.dropTable('resource_assignments', { transaction });
			}

			const columns = await queryInterface.describeTable('resources', { transaction });
			if (columns.legacy_hierarchical_resource_id) {
				await queryInterface.removeIndex(
					'resources',
					'uq_resources_legacy_hierarchical_resource_id',
					{ transaction }
				);
				await queryInterface.removeColumn('resources', 'legacy_hierarchical_resource_id', { transaction });
			}
		});
	},
};
