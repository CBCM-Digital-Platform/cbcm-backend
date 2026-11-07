process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'resources-test-jwt-secret';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize, DataTypes } = require('sequelize');
const express = require('express');
const request = require('supertest');
const { Readable } = require('node:stream');

const models = require('../../src/models');
const Role = require('../../src/enums/role.enum');
const LearningPermission = require('../../src/enums/learning-permission.enum');
const service = require('../../src/services/resources.service');
const repository = require('../../src/repositories/resources.repository');
const storage = require('../../src/providers/storage.provider');
const resourcesRoutes = require('../../src/routes/resources.routes');
const learningRoutes = require('../../src/routes/learning.routes');
const migration = require('../../src/database/migrations/20261023000000-add-module-id-to-resources');
const retireHierarchicalResourcesMigration = require('../../src/database/migrations/20261102000000-retire-hierarchical-resources');
const resourceAssignmentLifecycleMigration = require('../../src/database/migrations/20261103000000-add-resource-assignment-lifecycle');
const learningRepository = require('../../src/repositories/learning.repository');
const { generateAccessToken } = require('../../src/utils/token.util');

describe('Resources CRUD API (Step 5)', () => {
	let app;
	let adminUser, facility1Admin, facility2Admin, mentorUser, menteeUser, otherMenteeUser;
	let thematicArea1, thematicArea2;
	let cycle1, cycle2;
	let moduleFacility1, moduleFacility2, unpublishedModule;
	let validPdfFile, validAudioFile, validVideoFile, textFile;
	let storageMock;

	before(async () => {
		await models.sequelize.sync({ force: true });

		// Set up Express test app
		app = express();
		app.use(express.json());
		app.use('/api/v1/resources', resourcesRoutes);
		app.use('/api/v1/learning', learningRoutes);

		// Seed Facilities
		await models.Facility.bulkCreate([
			{ id: 1, name: 'Facility Alpha', type: 'Hospital' },
			{ id: 2, name: 'Facility Beta', type: 'Clinic' },
		]);

		// Seed Users
		[adminUser, facility1Admin, facility2Admin, mentorUser, menteeUser, otherMenteeUser] = await models.User.bulkCreate([
			{ id: 1, email: 'admin@cbcm.org', role: Role.ADMIN, status: 'active', password_hash: 'hash', must_change_password: false },
			{ id: 2, email: 'facadmin1@cbcm.org', role: Role.FACILITY_ADMIN, status: 'active', facility_id: 1, password_hash: 'hash', must_change_password: false },
			{ id: 3, email: 'facadmin2@cbcm.org', role: Role.FACILITY_ADMIN, status: 'active', facility_id: 2, password_hash: 'hash', must_change_password: false },
			{ id: 4, email: 'mentor@cbcm.org', role: Role.MENTOR, status: 'active', facility_id: 1, password_hash: 'hash', must_change_password: false },
			{ id: 5, email: 'mentee@cbcm.org', role: Role.MENTEE, status: 'active', facility_id: 1, password_hash: 'hash', must_change_password: false },
			{ id: 6, email: 'othermentee@cbcm.org', role: Role.MENTEE, status: 'active', facility_id: 2, password_hash: 'hash', must_change_password: false },
		]);

		// Seed Thematic Areas
		[thematicArea1, thematicArea2] = await models.ThematicArea.bulkCreate([
			{ id: 1, code: 'MAL', name: 'Malaria' },
			{ id: 2, code: 'HIV', name: 'HIV/TB' },
		]);

		// Seed Mentorship Cycles
		[cycle1, cycle2] = await models.MentorshipCycle.bulkCreate([
			{ id: 1, name: 'Cycle Alpha', status: 'active' },
			{ id: 2, name: 'Cycle Beta', status: 'active' },
		]);

		// Link Facility 1 -> Cycle 1, and Cycle 1 -> Thematic Area 1
		await models.CycleFacility.create({ id: 1, cycle_id: 1, facility_id: 1 });
		await models.CycleThematicArea.create({ id: 1, cycle_id: 1, thematic_area_id: 1 });

		// Link Facility 2 -> Cycle 2, and Cycle 2 -> Thematic Area 2
		await models.CycleFacility.create({ id: 2, cycle_id: 2, facility_id: 2 });
		await models.CycleThematicArea.create({ id: 2, cycle_id: 2, thematic_area_id: 2 });

		// Seed Learning Modules
		// moduleFacility1: in Facility 1 scope (Thematic Area 1), published & authorized
		moduleFacility1 = await models.LearningModule.create({
			id: 1,
			title: 'Malaria Guidelines Module',
			thematic_area_id: 1,
			status: 'published',
			is_published: true,
			is_authorized: true,
			created_by: 2,
		});

		// moduleFacility2: in Facility 2 scope (Thematic Area 2), published & authorized
		moduleFacility2 = await models.LearningModule.create({
			id: 2,
			title: 'HIV Management Module',
			thematic_area_id: 2,
			status: 'published',
			is_published: true,
			is_authorized: true,
			created_by: 3,
		});

		// unpublishedModule: draft in Facility 1 scope
		unpublishedModule = await models.LearningModule.create({
			id: 3,
			title: 'Draft Malaria Module',
			thematic_area_id: 1,
			status: 'draft',
			is_published: false,
			is_authorized: false,
			created_by: 1,
		});

		// Seed Uploaded Files
		[validPdfFile, validAudioFile, validVideoFile, textFile] = await models.UploadedFile.bulkCreate([
			{ id: 1, owner_id: 1, context: 'resource', storage_key: 'pdf-key-123.pdf', mime_type: 'application/pdf', size_bytes: 1024 },
			{ id: 2, owner_id: 1, context: 'resource', storage_key: 'audio-key-123.mp3', mime_type: 'audio/mpeg', size_bytes: 2048 },
			{ id: 3, owner_id: 1, context: 'resource', storage_key: 'video-key-123.mp4', mime_type: 'video/mp4', size_bytes: 4096 },
			{ id: 4, owner_id: 1, context: 'resource', storage_key: 'text-key-123.txt', mime_type: 'text/plain', size_bytes: 512 },
		]);

		// Mock Storage Provider (ensures no real AWS credentials)
		storageMock = {
			storeCalls: [],
			removeCalls: [],
			getStorageProvider: () => ({
				name: 'mock',
				store: async (opts) => {
					storageMock.storeCalls.push(opts);
					return { storageKey: 'mock-key.pdf', sizeBytes: 100, mimeType: opts.mimeType };
				},
				open: async () => ({ storageKey: 'mock-key.pdf', sizeBytes: Buffer.byteLength('resource content'), stream: Readable.from('resource content') }),
				remove: async (key) => {
					storageMock.removeCalls.push(key);
					return { storageKey: key, deleted: true };
				},
			}),
		};
		storage.getStorageProvider = storageMock.getStorageProvider;
	});

	after(async () => {
		await models.sequelize.close();
	});

	describe('Database Migration & Rollback', () => {
		it('should add module_id column and rollback cleanly in an isolated schema', async () => {
			const isolatedSequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
			const qi = isolatedSequelize.getQueryInterface();

			try {
				await qi.createTable('learning_modules', {
					id: { type: DataTypes.INTEGER, primaryKey: true },
					title: DataTypes.STRING,
				});
				await qi.createTable('resources', {
					id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
					title: DataTypes.STRING,
					type: DataTypes.STRING,
					thematic_area_id: DataTypes.INTEGER,
					url: DataTypes.STRING,
					file_id: DataTypes.INTEGER,
				});

				// Run migration up
				await migration.up(qi, Sequelize);
				const columnsAfterUp = await qi.describeTable('resources');
				assert.ok(columnsAfterUp.module_id, 'module_id column should exist after migration.up');

				// Run migration down (rollback)
				await migration.down(qi, Sequelize);
				const columnsAfterDown = await qi.describeTable('resources');
				assert.equal(columnsAfterDown.module_id, undefined, 'module_id column should be removed after migration.down');
			} finally {
				await isolatedSequelize.close();
			}
		});

		it('should add and safely roll back regular resource assignments when no legacy tables exist', async () => {
			const isolatedSequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
			const qi = isolatedSequelize.getQueryInterface();

			try {
				await qi.createTable('resources', {
					id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
					title: DataTypes.STRING,
					type: DataTypes.STRING,
				});
				await qi.createTable('users', {
					id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
				});
				await qi.createTable('facilities', {
					id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
				});

				await retireHierarchicalResourcesMigration.up(qi, Sequelize);
				const resourceColumns = await qi.describeTable('resources');
				const assignmentColumns = await qi.describeTable('resource_assignments');
				assert.ok(resourceColumns.legacy_hierarchical_resource_id);
				assert.ok(assignmentColumns.resource_id);
				assert.ok(assignmentColumns.assignment_status);

				await retireHierarchicalResourcesMigration.down(qi, Sequelize);
				assert.equal((await qi.describeTable('resources')).legacy_hierarchical_resource_id, undefined);
				assert.equal((await qi.showAllTables()).includes('resource_assignments'), false);
			} finally {
				await isolatedSequelize.close();
			}
		});

		it('should extend assignment lifecycle without losing history and protect rollback', async () => {
			const isolatedSequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
			const qi = isolatedSequelize.getQueryInterface();

			try {
				await qi.createTable('resource_assignments', {
					id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
					resource_id: DataTypes.INTEGER,
					mentor_id: DataTypes.INTEGER,
					mentee_id: DataTypes.INTEGER,
					facility_id: DataTypes.INTEGER,
					assignment_status: { type: DataTypes.ENUM('active', 'revoked'), allowNull: false, defaultValue: 'active' },
					assigned_by: DataTypes.INTEGER,
					assigned_at: DataTypes.DATE,
					revoked_at: DataTypes.DATE,
					revoked_by: DataTypes.INTEGER,
				});
				await qi.bulkInsert('resource_assignments', [{
					resource_id: 1,
					mentor_id: 2,
					mentee_id: 3,
					assignment_status: 'revoked',
					assigned_by: 2,
					assigned_at: new Date(),
				}]);

				await resourceAssignmentLifecycleMigration.up(qi, Sequelize);
				await resourceAssignmentLifecycleMigration.up(qi, Sequelize);
				const columns = await qi.describeTable('resource_assignments');
				assert.ok(columns.completed_at);
				const [assignmentRows] = await isolatedSequelize.query('SELECT assignment_status FROM resource_assignments');
				assert.equal(assignmentRows[0].assignment_status, 'revoked');
				assert.ok((await qi.showIndex('resource_assignments')).some((index) => index.name === 'idx_resource_assignments_mentee_status_assigned'));

				await qi.bulkInsert('resource_assignments', [{
					resource_id: 2,
					mentor_id: 2,
					mentee_id: 3,
					assignment_status: 'completed',
					assigned_by: 2,
					assigned_at: new Date(),
					completed_at: new Date(),
				}]);
				await assert.rejects(resourceAssignmentLifecycleMigration.down(qi, Sequelize), /completed assignment history exists/);
				await qi.bulkDelete('resource_assignments', { assignment_status: 'completed' });
				await resourceAssignmentLifecycleMigration.down(qi, Sequelize);
				assert.equal((await qi.describeTable('resource_assignments')).completed_at, undefined);
			} finally {
				await isolatedSequelize.close();
			}
		});
	});

	describe('Creation & Validation (POST /resources)', () => {
		it('should create a valid resource with audit fields and return safe DTO', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const resource = await service.createResource({
				title: 'Malaria Treatment Protocol',
				type: 'pdf',
				thematic_area_id: 1,
				module_id: 1,
				file_id: 1,
			}, admin);

			assert.ok(resource.id);
			assert.equal(resource.title, 'Malaria Treatment Protocol');
			assert.equal(resource.type, 'pdf');
			assert.equal(resource.thematicAreaId, 1);
			assert.equal(resource.moduleId, 1);
			assert.equal(resource.fileId, 1);
			assert.equal(resource.createdBy, 1);
			assert.equal(resource.updatedBy, 1);
			assert.ok(resource.module);
			assert.equal(resource.module.title, 'Malaria Guidelines Module');
			assert.ok(resource.file);
			assert.equal(resource.file.mimeType, 'application/pdf');

			// Security: verify no storage keys, credentials, or private URLs are exposed
			assert.equal(Object.prototype.hasOwnProperty.call(resource, 'storage_key'), false);
			assert.equal(Object.prototype.hasOwnProperty.call(resource, 'storageKey'), false);
			assert.equal(Object.prototype.hasOwnProperty.call(resource.file, 'storage_key'), false);
			assert.equal(Object.prototype.hasOwnProperty.call(resource.file, 'storageKey'), false);

			// Clean up
			await service.deleteResource(resource.id, admin);
		});

		it('should reject missing file', async () => {
			const admin = { id: 1, role: Role.ADMIN };
			await assert.rejects(
				service.createResource({
					title: 'Test',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 9999, // Non-existent file
				}, admin),
				{ statusCode: 404 }
			);
		});

		it('should reject missing module', async () => {
			const admin = { id: 1, role: Role.ADMIN };
			await assert.rejects(
				service.createResource({
					title: 'Test',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 9999, // Non-existent module
					file_id: 1,
				}, admin),
				{ statusCode: 404 }
			);
		});

		it('should reject module and thematic-area mismatch', async () => {
			const admin = { id: 1, role: Role.ADMIN };
			// moduleFacility1 belongs to thematic_area_id 1; passing thematic_area_id 2 must fail
			await assert.rejects(
				service.createResource({
					title: 'Test Mismatch',
					type: 'pdf',
					thematic_area_id: 2,
					module_id: 1,
					file_id: 1,
				}, admin),
				{ statusCode: 400, code: 'MODULE_THEMATIC_AREA_MISMATCH' }
			);
		});

		it('should reject MIME and resource type mismatch', async () => {
			const admin = { id: 1, role: Role.ADMIN };
			// File 1 is PDF (application/pdf), but declared type is video
			await assert.rejects(
				service.createResource({
					title: 'Test MIME Mismatch',
					type: 'video',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
				}, admin),
				{ statusCode: 400, code: 'MIME_TYPE_MISMATCH' }
			);
		});

		it('should reject unsupported file MIME types', async () => {
			const admin = { id: 1, role: Role.ADMIN };
			// File 4 is text/plain
			await assert.rejects(
				service.createResource({
					title: 'Text Resource',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 4,
				}, admin),
				{ statusCode: 400, code: 'UNSUPPORTED_MEDIA_TYPE' }
			);
		});
	});

	describe('Permissions & Facility Boundaries', () => {
		let facility1Resource, facility2Resource;

		before(async () => {
			const admin = { id: 1, role: Role.ADMIN };
			facility1Resource = await service.createResource({
				title: 'Facility 1 Malaria PDF',
				type: 'pdf',
				thematic_area_id: 1,
				module_id: 1,
				file_id: 1,
			}, admin);

			facility2Resource = await service.createResource({
				title: 'Facility 2 HIV Video',
				type: 'video',
				thematic_area_id: 2,
				module_id: 2,
				file_id: 3,
			}, admin);
		});

		after(async () => {
			const admin = { id: 1, role: Role.ADMIN };
			if (facility1Resource) await service.deleteResource(facility1Resource.id, admin).catch(() => {});
			if (facility2Resource) await service.deleteResource(facility2Resource.id, admin).catch(() => {});
		});

		it('should reject facility admin from creating resource (only super admin allowed)', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			await assert.rejects(
				service.createResource({
					title: 'Fac1 Audio Resource',
					type: 'audio',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 2,
				}, fac1Admin),
				{ statusCode: 403 }
			);
		});

		it('should reject facility admin from assigning resources to mentees', async () => {
			await assert.rejects(
				service.assignResourceToMentee(facility1Resource.id, menteeUser.id, facility1Admin),
				{ statusCode: 403 }
			);
		});

		it('should allow facility admin to read resource in their facility scope', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const res = await service.getResource(facility1Resource.id, fac1Admin);
			assert.equal(res.id, facility1Resource.id);
		});

		it('should allow facility admin to read resources outside their facility scope', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const res = await service.getResource(facility2Resource.id, fac1Admin);
			assert.equal(res.id, facility2Resource.id);
		});

		it('should reject facility admin from updating resource (only super admin allowed)', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			await assert.rejects(
				service.updateResource(facility1Resource.id, {
					title: 'Updated Facility 1 Title',
				}, fac1Admin),
				{ statusCode: 403 }
			);
		});

		it('should reject facility admin from deleting resource (only super admin allowed)', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			await assert.rejects(
				service.deleteResource(facility1Resource.id, fac1Admin),
				{ statusCode: 403 }
			);
		});

		it('should allow facility admin to list resources across all facilities', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const list = await service.listResources({}, fac1Admin);

			assert.ok(list.items.some((r) => r.id === facility1Resource.id));
			assert.ok(list.items.some((r) => r.id === facility2Resource.id));
		});
	});

	describe('Mentor & Mentee Access Rules', () => {
		let authorizedResource, draftModuleResource;

		before(async () => {
			const admin = { id: 1, role: Role.ADMIN };

			authorizedResource = await service.createResource({
				title: 'Authorized Malaria PDF',
				type: 'pdf',
				thematic_area_id: 1,
				module_id: 1,
				file_id: 1,
			}, admin);

			draftModuleResource = await service.createResource({
				title: 'Draft Module PDF',
				type: 'pdf',
				thematic_area_id: 1,
				module_id: 3, // unpublishedModule
				file_id: 1,
			}, admin);
		});

		after(async () => {
			const admin = { id: 1, role: Role.ADMIN };
			if (authorizedResource) await service.deleteResource(authorizedResource.id, admin).catch(() => {});
			if (draftModuleResource) await service.deleteResource(draftModuleResource.id, admin).catch(() => {});
		});

		it('should reject mentor and mentee from creating, updating, or deleting resources', async () => {
			const mentor = { id: 4, role: Role.MENTOR, facility_id: 1 };
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };

			await assert.rejects(service.createResource({ title: 'A', type: 'pdf', thematic_area_id: 1, module_id: 1, file_id: 1 }, mentor), { statusCode: 403 });
			await assert.rejects(service.createResource({ title: 'A', type: 'pdf', thematic_area_id: 1, module_id: 1, file_id: 1 }, mentee), { statusCode: 403 });
			await assert.rejects(service.updateResource(authorizedResource.id, { title: 'B' }, mentor), { statusCode: 403 });
			await assert.rejects(service.updateResource(authorizedResource.id, { title: 'B' }, mentee), { statusCode: 403 });
			await assert.rejects(service.deleteResource(authorizedResource.id, mentor), { statusCode: 403 });
			await assert.rejects(service.deleteResource(authorizedResource.id, mentee), { statusCode: 403 });
		});

		it('should reject mentor when module is unpublished or unauthorized', async () => {
			const mentor = { id: 4, role: Role.MENTOR, facility_id: 1 };
			await assert.rejects(
				service.getResource(draftModuleResource.id, mentor),
				{ statusCode: 403 }
			);
		});

		it('should reject mentor without RESOURCES_VIEW permission', async () => {
			const mentor = { id: 4, role: Role.MENTOR, facility_id: 1 };
			// Ensure no permission granted
			await models.LearningModuleMentorPermission.destroy({ where: { mentor_id: 4, module_id: 1 } });
			await assert.rejects(
				service.getResource(authorizedResource.id, mentor),
				{ statusCode: 403 }
			);
		});

		it('should reject mentor without active assignment even with permission', async () => {
			const mentor = { id: 4, role: Role.MENTOR, facility_id: 1 };
			// Grant permission but no assignment
			await models.LearningModuleMentorPermission.create({
				module_id: 1,
				mentor_id: 4,
				permission: LearningPermission.RESOURCES_VIEW,
				granted_by: 1,
				granted_at: new Date(),
			});
			await models.Assignment.destroy({ where: { mentor_id: 4 } });

			await assert.rejects(
				service.getResource(authorizedResource.id, mentor),
				{ statusCode: 403 }
			);
		});

		it('should allow mentor to view resource when module is published, permission granted, and assigned', async () => {
			const mentor = { id: 4, role: Role.MENTOR, facility_id: 1 };

			// Ensure permission exists
			await models.LearningModuleMentorPermission.findOrCreate({
				where: { module_id: 1, mentor_id: 4, permission: LearningPermission.RESOURCES_VIEW },
				defaults: { module_id: 1, mentor_id: 4, permission: LearningPermission.RESOURCES_VIEW, granted_by: 1, granted_at: new Date() },
			});

			// Create active assignment in Thematic Area 1
			await models.Assignment.create({
				id: 99,
				mentor_id: 4,
				mentee_id: 5,
				facility_id: 1,
				thematic_area_id: 1,
				cycle_id: 1,
				status: 'active',
			});

			const res = await service.getResource(authorizedResource.id, mentor);
			assert.equal(res.id, authorizedResource.id);
		});

		it('should allow mentor to view all module resources from module access without a resource permission grant', async () => {
			const mentor = { id: 4, role: Role.MENTOR, facility_id: 1 };
			await models.LearningModuleMentorPermission.destroy({ where: { module_id: 1, mentor_id: 4 } });
			const moduleAccess = await models.LearningModuleMentorAccess.create({
				module_id: 1,
				mentor_id: 4,
				granted_by: 1,
				granted_at: new Date(),
				revoked_at: null,
			});
			try {
				const res = await service.getResource(authorizedResource.id, mentor);
				assert.equal(res.id, authorizedResource.id);
			} finally {
				await moduleAccess.destroy();
				await models.LearningModuleMentorPermission.create({
					module_id: 1,
					mentor_id: 4,
					permission: LearningPermission.RESOURCES_VIEW,
					granted_by: 1,
					granted_at: new Date(),
				});
			}
		});

		it('should reject mentee when module is unpublished or unauthorized', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			await assert.rejects(
				service.getResource(draftModuleResource.id, mentee),
				{ statusCode: 403 }
			);
		});

		it('should allow an individually assigned resource without a mentee permission grant', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			await models.LearningModuleProgress.destroy({ where: { mentee_id: 5, module_id: 1 } });
			await models.ResourceAssignment.findOrCreate({
				where: {
					resource_id: authorizedResource.id,
					mentee_id: 5,
					assignment_status: 'active',
				},
				defaults: {
					resource_id: authorizedResource.id,
					mentor_id: 4,
					mentee_id: 5,
					facility_id: 1,
					assignment_status: 'active',
					assigned_by: 4,
					assigned_at: new Date(),
				},
			});
			const resource = await service.getResource(authorizedResource.id, mentee);
			assert.equal(resource.id, authorizedResource.id);
		});

		it('should allow an active mentee assignment after the mentor module grant is revoked', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			await models.ResourceAssignment.findOrCreate({
				where: {
					resource_id: authorizedResource.id,
					mentee_id: 5,
					assignment_status: 'active',
				},
				defaults: {
					resource_id: authorizedResource.id,
					mentor_id: 4,
					mentee_id: 5,
					facility_id: 1,
					assignment_status: 'active',
					assigned_by: 4,
					assigned_at: new Date(),
				},
			});
			const grants = await models.LearningModuleMentorPermission.findAll({ where: { module_id: 1, mentor_id: 4 } });
			const legacyGrant = await models.LearningModuleMentorAccess.findOne({ where: { module_id: 1, mentor_id: 4 } });
			await models.LearningModuleMentorPermission.destroy({ where: { module_id: 1, mentor_id: 4 } });
			if (legacyGrant) await legacyGrant.destroy();
			try {
				const resource = await service.getResource(authorizedResource.id, mentee);
				assert.equal(resource.id, authorizedResource.id);
			} finally {
				await models.LearningModuleMentorPermission.bulkCreate(grants.map((grant) => grant.get({ plain: true })));
			}
		});

		it('should not grant resource access from module access alone', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			await models.LearningModuleProgress.create({
				mentee_id: 5,
				module_id: 1,
				status: 'in_progress',
				assigned_by: 4,
				assigned_at: new Date(),
			});
			await models.ResourceAssignment.destroy({
				where: { resource_id: authorizedResource.id, mentee_id: 5 },
			});

			await assert.rejects(
				service.getResource(authorizedResource.id, mentee),
				{ statusCode: 403 }
			);
		});

		it('should reject content access when an individual resource assignment is revoked', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			const revokedAt = new Date();
			await models.ResourceAssignment.create({
				resource_id: authorizedResource.id,
				mentor_id: 4,
				mentee_id: 5,
				facility_id: 1,
				assignment_status: 'revoked',
				assigned_by: 4,
				assigned_at: new Date(),
				revoked_at: revokedAt,
				revoked_by: 4,
			});

			await assert.rejects(
				service.getResource(authorizedResource.id, mentee),
				{ statusCode: 403 }
			);
			const history = await models.ResourceAssignment.findOne({
				where: { resource_id: authorizedResource.id, mentee_id: 5, assignment_status: 'revoked' },
			});
			assert.ok(history);
			assert.equal(history.revoked_by, 4);
			assert.equal(new Date(history.revoked_at).getTime(), revokedAt.getTime());
		});

		it('should filter mentee resource lists to individually assigned resources', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			await models.LearningModuleProgress.destroy({ where: { mentee_id: 5, module_id: 1 } });
			await models.ResourceAssignment.findOrCreate({
				where: {
					resource_id: authorizedResource.id,
					mentee_id: 5,
					assignment_status: 'active',
				},
				defaults: {
					resource_id: authorizedResource.id,
					mentor_id: 4,
					mentee_id: 5,
					facility_id: 1,
					assignment_status: 'active',
					assigned_by: 4,
					assigned_at: new Date(),
				},
			});
			const list = await service.listResources({}, mentee);

			assert.ok(list.items.some((r) => r.id === authorizedResource.id));
			// Mentee has no access to module 2 or module 3
			assert.equal(list.items.some((r) => r.moduleId === 2), false);
			assert.equal(list.items.some((r) => r.moduleId === 3), false);
		});

		it('should let mentors assign and revoke regular resources for their own mentees', async () => {
			await models.ResourceAssignment.destroy({
				where: {
					resource_id: authorizedResource.id,
					mentee_id: 5,
				},
			});
			const mentorToken = generateAccessToken(mentorUser);
			const menteeToken = generateAccessToken(menteeUser);
			const assignmentPath = `/api/v1/resources/${authorizedResource.id}/mentees/5`;

			const assigned = await request(app)
				.post(assignmentPath)
				.set('Authorization', `Bearer ${mentorToken}`);
			assert.equal(assigned.status, 201);
			assert.equal(assigned.body.data.assigned, true);

			const accessible = await request(app)
				.get(`/api/v1/resources/${authorizedResource.id}`)
				.set('Authorization', `Bearer ${menteeToken}`);
			assert.equal(accessible.status, 200);

			const revoked = await request(app)
				.delete(assignmentPath)
				.set('Authorization', `Bearer ${mentorToken}`);
			assert.equal(revoked.status, 200);
			const assignmentHistory = await models.ResourceAssignment.findOne({
				where: {
					resource_id: authorizedResource.id,
					mentee_id: 5,
					mentor_id: 4,
					assignment_status: 'revoked',
				},
			});
			assert.ok(assignmentHistory);
			assert.ok(assignmentHistory.revoked_at);
			assert.equal(assignmentHistory.revoked_by, 4);

			const denied = await request(app)
				.get(`/api/v1/resources/${authorizedResource.id}/content`)
				.set('Authorization', `Bearer ${menteeToken}`);
			assert.equal(denied.status, 403);

			const otherMentor = await models.User.create({
				email: 'other-mentor@cbcm.org',
				role: Role.MENTOR,
				status: 'active',
				facility_id: 1,
				password_hash: 'hash',
				must_change_password: false,
			});
			const otherMentee = await models.User.create({
				email: 'other-mentee-same-facility@cbcm.org',
				role: Role.MENTEE,
				status: 'active',
				facility_id: 1,
				password_hash: 'hash',
				must_change_password: false,
			});
			const otherMentorAssignment = await models.Assignment.create({
				mentor_id: otherMentor.id,
				mentee_id: otherMentee.id,
				facility_id: 1,
				thematic_area_id: 1,
				cycle_id: 1,
				status: 'active',
			});
			try {
				const deniedAssignment = await request(app)
					.post(`/api/v1/resources/${authorizedResource.id}/mentees/${otherMentee.id}`)
					.set('Authorization', `Bearer ${mentorToken}`);
				assert.equal(deniedAssignment.status, 403);
			} finally {
				await otherMentorAssignment.destroy();
				await otherMentee.destroy();
				await otherMentor.destroy();
			}
		});

		it('should enforce lifecycle and authorization across the learning resource assignment APIs', async () => {
			await models.ResourceAssignment.destroy({
				where: { resource_id: authorizedResource.id, mentee_id: 5 },
			});
			const [permission] = await models.LearningModuleMentorPermission.findOrCreate({
				where: {
					module_id: 1,
					mentor_id: 4,
					permission: LearningPermission.RESOURCES_VIEW,
					revoked_at: null,
				},
				defaults: {
					module_id: 1,
					mentor_id: 4,
					permission: LearningPermission.RESOURCES_VIEW,
					granted_by: 1,
					granted_at: new Date(),
				},
			});
			await permission.update({ revoked_at: null });
			await models.Assignment.findOrCreate({
				where: {
					mentor_id: 4,
					mentee_id: 5,
					facility_id: 1,
					cycle_id: 1,
					thematic_area_id: 1,
					status: 'active',
					unassigned_at: null,
				},
				defaults: {
					mentor_id: 4,
					mentee_id: 5,
					facility_id: 1,
					cycle_id: 1,
					thematic_area_id: 1,
					status: 'active',
				},
			});

			const mentorToken = generateAccessToken(mentorUser);
			const menteeToken = generateAccessToken(menteeUser);
			const assignmentPath = `/api/v1/learning/modules/1/resources/${authorizedResource.id}/assignments`;
			const created = await request(app)
				.post(assignmentPath)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '))
				.send({ mentee_id: 5 });
			assert.equal(created.status, 201);
			assert.equal(created.body.data.status, 'active');

			const duplicate = await request(app)
				.post(assignmentPath)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '))
				.send({ mentee_id: 5 });
			assert.equal(duplicate.status, 200);
			assert.equal(duplicate.body.data.assignmentId, created.body.data.assignmentId);

			const crossFacility = await request(app)
				.post(assignmentPath)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '))
				.send({ mentee_id: 6 });
			assert.equal(crossFacility.status, 403);

			const otherModuleResource = await service.createResource({
				title: 'Other module resource for assignment scope test',
				type: 'video',
				thematic_area_id: 2,
				module_id: 2,
				file_id: 3,
			}, { id: 1, role: Role.ADMIN });
			const unauthorizedModule = await request(app)
				.post(`/api/v1/learning/modules/2/resources/${otherModuleResource.id}/assignments`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '))
				.send({ mentee_id: 5 });
			assert.equal(unauthorizedModule.status, 403);

			const unpublishedModule = await request(app)
				.post(`/api/v1/learning/modules/3/resources/${draftModuleResource.id}/assignments`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '))
				.send({ mentee_id: 5 });
			assert.equal(unpublishedModule.status, 403);

			const moduleMismatch = await request(app)
				.post(`/api/v1/learning/modules/2/resources/${authorizedResource.id}/assignments`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '))
				.send({ mentee_id: 5 });
			assert.equal(moduleMismatch.status, 400);

			const menteeList = await request(app)
				.get('/api/v1/learning/my/resources')
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), menteeToken].join(' '));
			assert.equal(menteeList.status, 200);
			assert.ok(menteeList.body.data.some((entry) => entry.resourceId === authorizedResource.id));

			const details = await request(app)
				.get(`/api/v1/learning/my/resources/${authorizedResource.id}`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), menteeToken].join(' '));
			assert.equal(details.status, 200);
			assert.equal(Object.prototype.hasOwnProperty.call(details.body.data, 'url'), false);

			const content = await request(app)
				.get(`/api/v1/learning/my/resources/${authorizedResource.id}/content`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), menteeToken].join(' '));
			assert.equal(content.status, 200);
			assert.equal(content.body.toString(), 'resource content');

			const completed = await request(app)
				.post(`/api/v1/learning/my/resources/${authorizedResource.id}/complete`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), menteeToken].join(' '));
			assert.equal(completed.status, 200);
			assert.equal(completed.body.data.status, 'completed');
			assert.ok(completed.body.data.completedAt);

			const deniedContent = await request(app)
				.get(`/api/v1/learning/my/resources/${authorizedResource.id}/content`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), menteeToken].join(' '));
			assert.equal(deniedContent.status, 403);

			const reassigned = await request(app)
				.post(assignmentPath)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '))
				.send({ mentee_id: 5 });
			assert.equal(reassigned.status, 201);
			assert.notEqual(reassigned.body.data.assignmentId, created.body.data.assignmentId);
			assert.equal(await models.ResourceAssignment.count({
				where: {
					resource_id: authorizedResource.id,
					mentee_id: 5,
					assignment_status: 'completed',
				},
			}), 1);
			const revoked = await request(app)
				.post(`/api/v1/learning/resource-assignments/${reassigned.body.data.assignmentId}/revoke`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '));
			assert.equal(revoked.status, 200);
			assert.equal(revoked.body.data.status, 'revoked');
			assert.ok(revoked.body.data.revokedAt);

			const reassignedAfterRevoke = await request(app)
				.post(assignmentPath)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '))
				.send({ mentee_id: 5 });
			assert.equal(reassignedAfterRevoke.status, 201);

			const mentorProgress = await request(app)
				.get(assignmentPath)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '));
			assert.equal(mentorProgress.status, 200);
			assert.ok(mentorProgress.body.data.some((entry) => (
				entry.status === 'completed' && entry.completedAt && entry.menteeId === 5
			)));
			assert.ok(mentorProgress.body.data.some((entry) => (
				entry.status === 'revoked' && entry.revokedAt && entry.id === reassigned.body.data.assignmentId
			)));
			assert.ok(mentorProgress.body.data.some((entry) => entry.id === reassignedAfterRevoke.body.data.assignmentId));

			const menteeProgress = await request(app)
				.get('/api/v1/learning/mentees/5/resources')
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '));
			assert.equal(menteeProgress.status, 200);
			assert.ok(menteeProgress.body.data.some((entry) => entry.status === 'completed'));
			assert.ok(menteeProgress.body.data.some((entry) => entry.status === 'revoked'));

			const otherMenteeToken = generateAccessToken(otherMenteeUser);
			const otherMenteeDenied = await request(app)
				.get(`/api/v1/learning/my/resources/${authorizedResource.id}`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), otherMenteeToken].join(' '));
			assert.equal(otherMenteeDenied.status, 403);

			const otherMentor = await models.User.create({
				email: 'resource-revoke-other-mentor@cbcm.org',
				role: Role.MENTOR,
				status: 'active',
				facility_id: 1,
				password_hash: 'hash',
				must_change_password: false,
			});
			try {
				const otherMentorToken = generateAccessToken(otherMentor);
				const unauthorizedRevoke = await request(app)
					.post(`/api/v1/learning/resource-assignments/${reassignedAfterRevoke.body.data.assignmentId}/revoke`)
					.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), otherMentorToken].join(' '));
				assert.equal(unauthorizedRevoke.status, 403);
				const outOfScopeFacilityAdmin = await request(app)
					.post(`/api/v1/learning/resource-assignments/${reassignedAfterRevoke.body.data.assignmentId}/revoke`)
					.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), generateAccessToken(facility2Admin)].join(' '));
				assert.equal(outOfScopeFacilityAdmin.status, 403);
			} finally {
				await otherMentor.destroy();
			}

			await models.ResourceAssignment.destroy({
				where: { resource_id: authorizedResource.id, mentee_id: 5 },
			});
			await service.deleteResource(otherModuleResource.id, { id: 1, role: Role.ADMIN });
		});

		it('should not let legacy module access override a revoked resource-view permission', async () => {
			await models.LearningModuleMentorPermission.update({
				revoked_at: new Date(),
			}, {
				where: {
					module_id: 1,
					mentor_id: 4,
					permission: LearningPermission.RESOURCES_VIEW,
				},
			});
			const permission = await models.LearningModuleMentorPermission.create({
				module_id: 1,
				mentor_id: 4,
				permission: LearningPermission.RESOURCES_VIEW,
				granted_by: 1,
				granted_at: new Date(),
				revoked_at: new Date(),
				revoked_by: 1,
			});
			const legacyAccess = await models.LearningModuleMentorAccess.create({
				module_id: 1,
				mentor_id: 4,
				granted_by: 1,
				granted_at: new Date(),
			});
			const accessOnlyMentor = await models.User.create({
				email: 'resource-access-only-mentor@cbcm.org',
				role: Role.MENTOR,
				status: 'active',
				facility_id: 1,
				password_hash: 'hash',
				must_change_password: false,
			});
			const accessOnlyGrant = await models.LearningModuleMentorAccess.create({
				module_id: 1,
				mentor_id: accessOnlyMentor.id,
				granted_by: 1,
				granted_at: new Date(),
			});
			try {
				assert.equal(await learningRepository.hasModuleMentorPermission({
					mentorId: 4,
					moduleId: 1,
					permission: LearningPermission.RESOURCES_VIEW,
				}), false);
				assert.equal(await learningRepository.hasModuleMentorPermission({
					mentorId: accessOnlyMentor.id,
					moduleId: 1,
					permission: LearningPermission.RESOURCES_VIEW,
				}), false);
				await assert.rejects(service.getResource(authorizedResource.id, {
					id: 4,
					role: Role.MENTOR,
					facility_id: 1,
				}), { statusCode: 403 });
			} finally {
				await permission.destroy();
				await legacyAccess.destroy();
				await accessOnlyGrant.destroy();
				await accessOnlyMentor.destroy();
			}
		});
	});

	describe('Deletion Preserves UploadedFile & Storage Object', () => {
		it('should delete resource record without deleting UploadedFile or calling storage.remove', async () => {
			const admin = { id: 1, role: Role.ADMIN };

			const res = await service.createResource({
				title: 'Resource To Delete',
				type: 'audio',
				thematic_area_id: 1,
				module_id: 1,
				file_id: 2,
			}, admin);

			const fileBefore = await models.UploadedFile.findByPk(2);
			assert.ok(fileBefore, 'UploadedFile must exist prior to deletion');

			const initialRemoveCount = storageMock.removeCalls.length;

			const deleteResult = await service.deleteResource(res.id, admin);
			assert.equal(deleteResult.deleted, true);

			// Verify resource record is deleted
			const resourceAfter = await models.Resource.findByPk(res.id);
			assert.equal(resourceAfter, null, 'Resource must be deleted from DB');

			// Verify UploadedFile is preserved
			const fileAfter = await models.UploadedFile.findByPk(2);
			assert.ok(fileAfter, 'UploadedFile must NOT be deleted');
			assert.equal(fileAfter.id, 2);

			// Verify storage provider remove was NEVER called
			assert.equal(storageMock.removeCalls.length, initialRemoveCount, 'Storage provider remove() must NOT be called on resource deletion');
		});
	});

	describe('Legacy Resources (without module_id)', () => {
		let legacyResource;

		before(async () => {
			// Directly seed a legacy resource with module_id = null
			legacyResource = await models.Resource.create({
				title: 'Legacy Guideline Document',
				type: 'pdf',
				thematic_area_id: 1,
				module_id: null,
				url: 'https://legacy.example.org/docs/malaria-2020.pdf',
				file_id: 1,
				created_by: 1,
				updated_by: 1,
			});
		});

		after(async () => {
			const admin = { id: 1, role: Role.ADMIN };
			if (legacyResource) await service.deleteResource(legacyResource.id, admin).catch(() => {});
		});

		it('should allow admin to retrieve legacy resource with safe null module', async () => {
			const admin = { id: 1, role: Role.ADMIN };
			const res = await service.getResource(legacyResource.id, admin);

			assert.equal(res.id, legacyResource.id);
			assert.equal(res.moduleId, null);
			assert.equal(res.module, null);
			assert.equal(Object.prototype.hasOwnProperty.call(res, 'url'), false);
		});

		it('should allow facility admin to retrieve legacy resource within their facility thematic area scope', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const res = await service.getResource(legacyResource.id, fac1Admin);
			assert.equal(res.id, legacyResource.id);
		});

		it('should reject mentors and mentees from accessing legacy resources without module_id', async () => {
			const mentor = { id: 4, role: Role.MENTOR, facility_id: 1 };
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };

			await assert.rejects(service.getResource(legacyResource.id, mentor), { statusCode: 403 });
			await assert.rejects(service.getResource(legacyResource.id, mentee), { statusCode: 403 });
		});

		it('should allow updating legacy resource to link it to a module', async () => {
			const admin = { id: 1, role: Role.ADMIN };
			const updated = await service.updateResource(legacyResource.id, {
				module_id: 1,
			}, admin);

			assert.equal(updated.moduleId, 1);
			assert.ok(updated.module);
			assert.equal(updated.module.id, 1);
		});
	});

	describe('HTTP Routes Integration (/api/v1/resources)', () => {
		let adminToken, facAdminToken, mentorToken;
		let testResourceId;

		before(() => {
			adminToken = generateAccessToken(adminUser);
			facAdminToken = generateAccessToken(facility1Admin);
			mentorToken = generateAccessToken(mentorUser);
		});

		it('POST /api/v1/resources should create resource for authenticated admin', async () => {
			const response = await request(app)
				.post('/api/v1/resources')
				.set('Authorization', `Bearer ${adminToken}`)
				.send({
					title: 'HTTP Created Resource',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
				});

			assert.equal(response.status, 201);
			assert.equal(response.body.success, true);
			assert.equal(response.body.data.title, 'HTTP Created Resource');
			testResourceId = response.body.data.id;
		});

		it('POST /api/v1/resources should reject facility admin (only super admin allowed)', async () => {
			const response = await request(app)
				.post('/api/v1/resources')
				.set('Authorization', `Bearer ${facAdminToken}`)
				.send({
					title: 'Fac Admin Created',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
				});

			assert.equal(response.status, 403);
		});

		it('POST /api/v1/resources should reject unauthorized roles (e.g. mentor)', async () => {
			const response = await request(app)
				.post('/api/v1/resources')
				.set('Authorization', `Bearer ${mentorToken}`)
				.send({
					title: 'Mentor Created',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
				});

			assert.equal(response.status, 403);
		});

		it('GET /api/v1/resources should list resources with pagination', async () => {
			const response = await request(app)
				.get('/api/v1/resources?page=1&limit=10')
				.set('Authorization', `Bearer ${adminToken}`);

			assert.equal(response.status, 200);
			assert.equal(response.body.success, true);
			assert.ok(Array.isArray(response.body.data));
			assert.ok(response.body.meta);
			assert.equal(response.body.meta.page, 1);
		});

		it('GET /api/v1/resources/:id should return safe metadata', async () => {
			const response = await request(app)
				.get(`/api/v1/resources/${testResourceId}`)
				.set('Authorization', `Bearer ${adminToken}`);

			assert.equal(response.status, 200);
			assert.equal(response.body.success, true);
			assert.equal(response.body.data.id, testResourceId);
			assert.equal(response.body.data.storageKey, undefined);
		});

		it('PATCH /api/v1/resources/:id should update resource metadata', async () => {
			const response = await request(app)
				.patch(`/api/v1/resources/${testResourceId}`)
				.set('Authorization', `Bearer ${adminToken}`)
				.send({ title: 'HTTP Updated Resource' });

			assert.equal(response.status, 200);
			assert.equal(response.body.success, true);
			assert.equal(response.body.data.title, 'HTTP Updated Resource');
		});

		it('PATCH /api/v1/resources/:id should reject facility admin (only super admin allowed)', async () => {
			const response = await request(app)
				.patch(`/api/v1/resources/${testResourceId}`)
				.set('Authorization', `Bearer ${facAdminToken}`)
				.send({ title: 'Unauthorized Update' });

			assert.equal(response.status, 403);
		});

		it('DELETE /api/v1/resources/:id should delete resource record', async () => {
			const response = await request(app)
				.delete(`/api/v1/resources/${testResourceId}`)
				.set('Authorization', `Bearer ${adminToken}`);

			assert.equal(response.status, 200);
			assert.equal(response.body.success, true);
			assert.equal(response.body.data.deleted, true);

			// Subsequent GET returns 404
			const getResponse = await request(app)
				.get(`/api/v1/resources/${testResourceId}`)
				.set('Authorization', `Bearer ${adminToken}`);

			assert.equal(getResponse.status, 404);
		});
	});
});
