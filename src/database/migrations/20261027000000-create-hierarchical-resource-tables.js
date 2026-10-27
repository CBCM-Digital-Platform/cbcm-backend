module.exports = {
	up: async (queryInterface, Sequelize) => {
		const transaction = await queryInterface.sequelize.transaction();
		try {
			await queryInterface.createTable('hierarchical_resources', {
				id: {
					type: Sequelize.INTEGER,
					primaryKey: true,
					autoIncrement: true,
				},
				title: {
					type: Sequelize.STRING(255),
					allowNull: false,
				},
				description: {
					type: Sequelize.TEXT,
					allowNull: true,
				},
				type: {
					type: Sequelize.ENUM('pdf', 'audio', 'video'),
					allowNull: false,
				},
				uploaded_file_id: {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: {
						model: 'uploaded_files',
						key: 'id',
					},
					onDelete: 'SET NULL',
				},
				original_filename: {
					type: Sequelize.STRING(255),
					allowNull: true,
				},
				verified_mime_type: {
					type: Sequelize.STRING(100),
					allowNull: true,
				},
				file_size_bytes: {
					type: Sequelize.BIGINT,
					allowNull: true,
				},
				upload_status: {
					type: Sequelize.ENUM('pending', 'completed', 'failed'),
					defaultValue: 'pending',
					allowNull: false,
				},
				publication_status: {
					type: Sequelize.ENUM('draft', 'published', 'archived'),
					defaultValue: 'draft',
					allowNull: false,
				},
				created_by: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'users',
						key: 'id',
					},
				},
				updated_by: {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: {
						model: 'users',
						key: 'id',
					},
				},
				archived_at: {
					type: Sequelize.DATE,
					allowNull: true,
				},
				archived_by: {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: {
						model: 'users',
						key: 'id',
					},
				},
				created_at: {
					type: Sequelize.DATE,
					allowNull: false,
				},
				updated_at: {
					type: Sequelize.DATE,
					allowNull: false,
				},
			}, { transaction });

			await queryInterface.createTable('facility_resource_grants', {
				id: {
					type: Sequelize.INTEGER,
					primaryKey: true,
					autoIncrement: true,
				},
				resource_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'hierarchical_resources',
						key: 'id',
					},
					onDelete: 'CASCADE',
				},
				facility_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'facilities',
						key: 'id',
					},
					onDelete: 'CASCADE',
				},
				granted_by: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'users',
						key: 'id',
					},
				},
				grant_status: {
					type: Sequelize.ENUM('active', 'revoked'),
					defaultValue: 'active',
					allowNull: false,
				},
				granted_at: {
					type: Sequelize.DATE,
					allowNull: false,
				},
				revoked_at: {
					type: Sequelize.DATE,
					allowNull: true,
				},
				revoked_by: {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: {
						model: 'users',
						key: 'id',
					},
				},
			}, { transaction });

			await queryInterface.addIndex('facility_resource_grants', ['resource_id', 'facility_id'], {
				unique: true,
				where: { grant_status: 'active' },
				transaction,
			});
			await queryInterface.addIndex('facility_resource_grants', ['facility_id'], { transaction });
			await queryInterface.addIndex('facility_resource_grants', ['resource_id'], { transaction });

			await queryInterface.createTable('mentor_resource_grants', {
				id: {
					type: Sequelize.INTEGER,
					primaryKey: true,
					autoIncrement: true,
				},
				resource_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'hierarchical_resources',
						key: 'id',
					},
					onDelete: 'CASCADE',
				},
				facility_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'facilities',
						key: 'id',
					},
					onDelete: 'CASCADE',
				},
				mentor_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'users',
						key: 'id',
					},
					onDelete: 'CASCADE',
				},
				granted_by: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'users',
						key: 'id',
					},
				},
				grant_status: {
					type: Sequelize.ENUM('active', 'revoked'),
					defaultValue: 'active',
					allowNull: false,
				},
				granted_at: {
					type: Sequelize.DATE,
					allowNull: false,
				},
				revoked_at: {
					type: Sequelize.DATE,
					allowNull: true,
				},
				revoked_by: {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: {
						model: 'users',
						key: 'id',
					},
				},
			}, { transaction });

			await queryInterface.addIndex('mentor_resource_grants', ['resource_id', 'mentor_id'], {
				unique: true,
				where: { grant_status: 'active' },
				transaction,
			});
			await queryInterface.addIndex('mentor_resource_grants', ['facility_id'], { transaction });
			await queryInterface.addIndex('mentor_resource_grants', ['mentor_id'], { transaction });
			await queryInterface.addIndex('mentor_resource_grants', ['resource_id'], { transaction });

			await queryInterface.createTable('mentee_resource_assignments', {
				id: {
					type: Sequelize.INTEGER,
					primaryKey: true,
					autoIncrement: true,
				},
				resource_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'hierarchical_resources',
						key: 'id',
					},
					onDelete: 'CASCADE',
				},
				mentor_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'users',
						key: 'id',
					},
					onDelete: 'CASCADE',
				},
				mentee_id: {
					type: Sequelize.INTEGER,
					allowNull: false,
					references: {
						model: 'users',
						key: 'id',
					},
					onDelete: 'CASCADE',
				},
				facility_id: {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: {
						model: 'facilities',
						key: 'id',
					},
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
					references: {
						model: 'users',
						key: 'id',
					},
				},
				assigned_at: {
					type: Sequelize.DATE,
					allowNull: false,
				},
				revoked_at: {
					type: Sequelize.DATE,
					allowNull: true,
				},
				revoked_by: {
					type: Sequelize.INTEGER,
					allowNull: true,
					references: {
						model: 'users',
						key: 'id',
					},
				},
				learning_note: {
					type: Sequelize.TEXT,
					allowNull: true,
				},
			}, { transaction });

			await queryInterface.addIndex('mentee_resource_assignments', ['resource_id', 'mentee_id'], {
				unique: true,
				where: { assignment_status: 'active' },
				transaction,
			});
			await queryInterface.addIndex('mentee_resource_assignments', ['mentor_id'], { transaction });
			await queryInterface.addIndex('mentee_resource_assignments', ['mentee_id'], { transaction });
			await queryInterface.addIndex('mentee_resource_assignments', ['resource_id'], { transaction });
			await queryInterface.addIndex('mentee_resource_assignments', ['facility_id'], { transaction });

			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
	},

	down: async (queryInterface) => {
		const transaction = await queryInterface.sequelize.transaction();
		try {
			await queryInterface.dropTable('mentee_resource_assignments', { transaction });
			await queryInterface.dropTable('mentor_resource_grants', { transaction });
			await queryInterface.dropTable('facility_resource_grants', { transaction });
			await queryInterface.dropTable('hierarchical_resources', { transaction });
			await transaction.commit();
		} catch (error) {
			await transaction.rollback();
			throw error;
		}
	},
};
