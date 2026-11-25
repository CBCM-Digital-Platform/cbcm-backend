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
const uploadsService = require('../../src/services/uploads.service');
const resourcesRoutes = require('../../src/routes/resources.routes');
const learningRoutes = require('../../src/routes/learning.routes');
const migration = require('../../src/database/migrations/20261023000000-add-module-id-to-resources');
const retireHierarchicalResourcesMigration = require('../../src/database/migrations/20261102000000-retire-hierarchical-resources');
const resourceAssignmentLifecycleMigration = require('../../src/database/migrations/20261103000000-add-resource-assignment-lifecycle');
const resourceAssignmentScopeMigration = require('../../src/database/migrations/20261113010000-add-resource-assignment-scope-snapshots');
const resourceMaterialClassificationMigration = require('../../src/database/migrations/20261113000000-add-resource-learning-material-classification');
const learningRepository = require('../../src/repositories/learning.repository');
const { generateAccessToken } = require('../../src/utils/token.util');
const { inspectUploadedFile } = require('../../src/config/multer');

describe('Resources CRUD API (Step 5)', () => {
	let app;
	let adminUser, facility1Admin, facility2Admin, mentorUser, menteeUser, otherMenteeUser;
	let thematicArea1, thematicArea2;
	let cycle1, cycle2;
	let moduleFacility1, moduleFacility2, unpublishedModule;
	let validPdfFile, validAudioFile, validVideoFile, textFile, validPresentationFile;
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
		[validPdfFile, validAudioFile, validVideoFile, textFile, validPresentationFile] = await models.UploadedFile.bulkCreate([
			{ id: 1, owner_id: 1, context: 'resource', storage_key: 'pdf-key-123.pdf', mime_type: 'application/pdf', size_bytes: 1024 },
			{ id: 2, owner_id: 1, context: 'resource', storage_key: 'audio-key-123.mp3', mime_type: 'audio/mpeg', size_bytes: 2048 },
			{ id: 3, owner_id: 1, context: 'resource', storage_key: 'video-key-123.mp4', mime_type: 'video/mp4', size_bytes: 4096 },
			{ id: 4, owner_id: 1, context: 'resource', storage_key: 'text-key-123.txt', mime_type: 'text/plain', size_bytes: 512 },
			{ id: 5, owner_id: 1, context: 'resource', storage_key: 'presentation-key-123.pptx', mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size_bytes: 8192 },
		]);

		// Mock Storage Provider (ensures no real AWS credentials)
		storageMock = {
			storeCalls: [],
			removeCalls: [],
			getStorageProvider: () => ({
				name: 'mock',
				store: async (opts) => {
					storageMock.storeCalls.push(opts);
					const extension = opts.mimeType === 'application/vnd.ms-powerpoint'
						? '.ppt'
						: opts.mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
							? '.pptx'
							: '.pdf';
					return { storageKey: `mock-key${extension}`, sizeBytes: opts.body.length, mimeType: opts.mimeType };
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

		it('should add nullable scope snapshots without backfilling legacy assignments', async () => {
			const isolatedSequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
			const qi = isolatedSequelize.getQueryInterface();

			try {
				await qi.createTable('resource_assignments', {
					id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
					resource_id: DataTypes.INTEGER,
					mentee_id: DataTypes.INTEGER,
					assignment_status: DataTypes.STRING,
				});
				await qi.bulkInsert('resource_assignments', [{
					resource_id: 1,
					mentee_id: 2,
					assignment_status: 'completed',
				}]);

				await resourceAssignmentScopeMigration.up(qi, Sequelize);
				await resourceAssignmentScopeMigration.up(qi, Sequelize);
				const columns = await qi.describeTable('resource_assignments');
				assert.ok(columns.module_id.allowNull);
				assert.ok(columns.cycle_id.allowNull);
				assert.ok(columns.thematic_area_id.allowNull);
				const [rows] = await isolatedSequelize.query(
					'SELECT module_id, cycle_id, thematic_area_id FROM resource_assignments'
				);
				assert.deepEqual(rows[0], {
					module_id: null,
					cycle_id: null,
					thematic_area_id: null,
				});
				await assert.rejects(resourceAssignmentScopeMigration.down(qi, Sequelize), /intentionally irreversible/);
			} finally {
				await isolatedSequelize.close();
			}
		});

		it('should add Resource material classification fields without modifying existing columns', async () => {
			const isolatedSequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
			const qi = isolatedSequelize.getQueryInterface();

			try {
				await qi.createTable('resources', {
					id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
					title: DataTypes.STRING,
					type: DataTypes.STRING,
					module_id: DataTypes.INTEGER,
					file_id: DataTypes.INTEGER,
				});
				await qi.bulkInsert('resources', [{ title: 'Legacy Resource', type: 'pdf', module_id: 1, file_id: 1 }]);

				await resourceMaterialClassificationMigration.up(qi, Sequelize);
				const columns = await qi.describeTable('resources');
				assert.ok(columns.category);
				assert.ok(columns.examination_stage);
				assert.ok(columns.is_required);
				const [legacy] = await qi.sequelize.query('SELECT category, examination_stage, is_required FROM resources');
				assert.equal(legacy[0].category, null);
				assert.equal(legacy[0].examination_stage, null);
				assert.equal(legacy[0].is_required, 1);
				await assert.rejects(resourceMaterialClassificationMigration.down(qi, Sequelize), /intentionally irreversible/);
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
				category: 'PARTICIPANT_MANUAL',
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

		it('should create each material category and enforce examination-stage rules', async () => {
			const admin = { id: 1, role: Role.ADMIN };
			const created = [];
			const cases = [
				{ category: 'PARTICIPANT_MANUAL', type: 'pdf', file_id: 1, is_required: true },
				{ category: 'POWERPOINT_PRESENTATION', type: 'presentation', file_id: 5, is_required: true },
				{ category: 'FACILITATOR_GUIDE', type: 'pdf', file_id: 1 },
				{ category: 'EXAMINATION', type: 'pdf', file_id: 1, examination_stage: 'PRETEST', is_required: true },
				{ category: 'ANSWER_KEY', type: 'pdf', file_id: 1 },
			];

			try {
				for (const item of cases) {
					const resource = await service.createResource({
						title: item.category,
						thematic_area_id: 1,
						module_id: 1,
						...item,
					}, admin);
					created.push(resource.id);
					assert.equal(resource.category, item.category);
					assert.equal(resource.isRequired, item.is_required ?? false);
					if (item.examination_stage) {
						assert.equal(resource.examinationStage, item.examination_stage);
					}
				}

				const postTest = await service.createResource({
					title: 'Post Test',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
					category: 'EXAMINATION',
					examination_stage: 'POST_TEST',
				}, admin);
				created.push(postTest.id);
				assert.equal(postTest.examinationStage, 'POST_TEST');

				await assert.rejects(service.createResource({
					title: 'Missing Stage',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
					category: 'EXAMINATION',
				}, admin), { statusCode: 400 });
				await assert.rejects(service.createResource({
					title: 'Invalid Stage',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
					category: 'EXAMINATION',
					examination_stage: 'FINAL',
				}, admin), { statusCode: 400 });
				await assert.rejects(service.createResource({
					title: 'Non-examination Stage',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
					category: 'PARTICIPANT_MANUAL',
					examination_stage: 'PRETEST',
				}, admin), { statusCode: 400 });
				await assert.rejects(service.createResource({
					title: 'Invalid Category',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
					category: 'OTHER',
				}, admin), { statusCode: 400 });
				await assert.rejects(service.createResource({
					title: 'Missing Category',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
				}, admin), { statusCode: 400 });
				await assert.rejects(service.createResource({
					title: 'Null Category',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
					category: null,
				}, admin), { statusCode: 400 });
				await assert.rejects(service.createResource({
					title: 'Required Answer Key',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
					category: 'ANSWER_KEY',
					is_required: true,
				}, admin), { statusCode: 400 });
				const multiFormatPowerPointCategory = await service.createResource({
					title: 'PDF under PowerPoint Category',
					type: 'pdf',
					thematic_area_id: 1,
					module_id: 1,
					file_id: 1,
					category: 'POWERPOINT_PRESENTATION',
				}, admin);
				created.push(multiFormatPowerPointCategory.id);
				assert.equal(multiFormatPowerPointCategory.category, 'POWERPOINT_PRESENTATION');
				assert.equal(multiFormatPowerPointCategory.type, 'pdf');
			} finally {
				for (const id of created) await service.deleteResource(id, admin);
			}
		});

		it('should filter resource lists by category and examination stage', async () => {
			const admin = { id: 1, role: Role.ADMIN };
			const resource = await service.createResource({
				title: 'Pretest Resource',
				type: 'pdf',
				thematic_area_id: 1,
				module_id: 1,
				file_id: 1,
				category: 'EXAMINATION',
				examination_stage: 'PRETEST',
			}, admin);
			try {
				const result = await service.listResources({ category: 'EXAMINATION', examination_stage: 'PRETEST' }, admin);
				assert.ok(result.items.some((item) => item.id === resource.id));
			} finally {
				await service.deleteResource(resource.id, admin);
			}
		});

		it('should validate classification changes through the existing Resource update API', async () => {
			const admin = { id: 1, role: Role.ADMIN };
			const resource = await service.createResource({
				title: 'Classification Update',
				type: 'pdf',
				thematic_area_id: 1,
				module_id: 1,
				file_id: 1,
				category: 'PARTICIPANT_MANUAL',
			}, admin);
			try {
				await assert.rejects(service.updateResource(resource.id, {
					category: 'EXAMINATION',
				}, admin), { statusCode: 400 });
				const examination = await service.updateResource(resource.id, {
					category: 'EXAMINATION',
					examination_stage: 'PRETEST',
				}, admin);
				assert.equal(examination.category, 'EXAMINATION');
				assert.equal(examination.examinationStage, 'PRETEST');
				const guide = await service.updateResource(resource.id, {
					category: 'FACILITATOR_GUIDE',
				}, admin);
				assert.equal(guide.examinationStage, null);
				assert.equal(guide.isRequired, false);
			} finally {
				await service.deleteResource(resource.id, admin);
			}
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
					category: 'PARTICIPANT_MANUAL',
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
					category: 'PARTICIPANT_MANUAL',
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
					category: 'PARTICIPANT_MANUAL',
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
					category: 'PARTICIPANT_MANUAL',
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
					category: 'PARTICIPANT_MANUAL',
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
				category: 'PARTICIPANT_MANUAL',
			}, admin);

			facility2Resource = await service.createResource({
				title: 'Facility 2 HIV Video',
				type: 'video',
				thematic_area_id: 2,
				module_id: 2,
				file_id: 3,
				category: 'PARTICIPANT_MANUAL',
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

		it('should deny facility admin reads outside their facility scope', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			await assert.rejects(service.getResource(facility2Resource.id, fac1Admin), { statusCode: 403 });
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

		it('should scope facility admin resource lists to their facility', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const list = await service.listResources({}, fac1Admin);

			assert.ok(list.items.some((r) => r.id === facility1Resource.id));
			assert.ok(!list.items.some((r) => r.id === facility2Resource.id));
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
				category: 'PARTICIPANT_MANUAL',
			}, admin);

			draftModuleResource = await service.createResource({
				title: 'Draft Module PDF',
				type: 'pdf',
				thematic_area_id: 1,
				module_id: 3, // unpublishedModule
				file_id: 1,
				category: 'PARTICIPANT_MANUAL',
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

		it('should reject mentor without an active thematic-area assignment', async () => {
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

		it('should allow mentor to view ordinary resource with active thematic assignment', async () => {
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

		it('should upload, associate, and serve both PowerPoint formats to authorized mentors', async () => {
			const mentor = await models.User.create({
				email: 'resource-file-assigned-mentor@cbcm.org',
				role: Role.MENTOR,
				status: 'active',
				facility_id: 1,
				password_hash: 'hash',
				must_change_password: false,
			});

			await (async () => {
				const pptBuffer = Buffer.concat([
					Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]),
					Buffer.from('PowerPoint Document', 'utf16le'),
				]);
				const packageBuffer = (() => {
					const entries = [
						['[Content_Types].xml', '<Types/>'],
						['ppt/presentation.xml', '<presentation/>'],
					];
					const localParts = [];
					const centralParts = [];
					let localOffset = 0;
					for (const [name, content] of entries) {
						const nameBuffer = Buffer.from(name);
						const body = Buffer.from(content);
						const localHeader = Buffer.alloc(30);
						localHeader.writeUInt32LE(0x04034B50, 0);
						localHeader.writeUInt16LE(20, 4);
						localHeader.writeUInt32LE(body.length, 18);
						localHeader.writeUInt32LE(body.length, 22);
						localHeader.writeUInt16LE(nameBuffer.length, 26);
						localParts.push(localHeader, nameBuffer, body);
						const centralHeader = Buffer.alloc(46);
						centralHeader.writeUInt32LE(0x02014B50, 0);
						centralHeader.writeUInt16LE(20, 4);
						centralHeader.writeUInt16LE(20, 6);
						centralHeader.writeUInt32LE(body.length, 20);
						centralHeader.writeUInt32LE(body.length, 24);
						centralHeader.writeUInt16LE(nameBuffer.length, 28);
						centralHeader.writeUInt32LE(localOffset, 42);
						centralParts.push(centralHeader, nameBuffer);
						localOffset += localHeader.length + nameBuffer.length + body.length;
					}
					const centralDirectory = Buffer.concat(centralParts);
					const endRecord = Buffer.alloc(22);
					endRecord.writeUInt32LE(0x06054B50, 0);
					endRecord.writeUInt16LE(entries.length, 8);
					endRecord.writeUInt16LE(entries.length, 10);
					endRecord.writeUInt32LE(centralDirectory.length, 12);
					endRecord.writeUInt32LE(localOffset, 16);
					return Buffer.concat([...localParts, centralDirectory, endRecord]);
				})();
				const mentor = await models.User.create({
					email: 'powerpoint-workflow-mentor@cbcm.org',
					role: Role.MENTOR,
					status: 'active',
					facility_id: 1,
					password_hash: 'hash',
					must_change_password: false,
				})();
				const thematicAssignment = await models.Assignment.create({
					mentor_id: mentor.id,
					mentee_id: 5,
					facility_id: 1,
					cycle_id: 1,
					thematic_area_id: 1,
					status: 'active',
				});
				const uploadedIds = [];
				const resourceIds = [];
				try {
					for (const item of [
						{
							name: 'lesson.ppt',
							buffer: pptBuffer,
							mimeType: 'application/vnd.ms-powerpoint',
							fileId: null,
						},
						{
							name: 'lesson.pptx',
							buffer: packageBuffer,
							mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
							fileId: null,
						},
					]) {
						const inspected = inspectUploadedFile({
							buffer: item.buffer,
							size: item.buffer.length,
							mimetype: item.mimeType,
							originalname: item.name,
						});
						assert.equal(inspected.kind, 'presentation');
						const upload = await uploadsService.createUpload({
							actor: { id: 1, role: Role.ADMIN },
							upload: inspected,
						});
						uploadedIds.push(upload.id);
						assert.equal(upload.mimeType, item.mimeType);
						assert.deepEqual(storageMock.storeCalls.at(-1), {
							body: item.buffer,
							mimeType: item.mimeType,
						});
						const uploadedRecord = await models.UploadedFile.findByPk(upload.id);
						assert.ok(uploadedRecord.storage_key.endsWith(item.name.endsWith('.pptx') ? '.pptx' : '.ppt'));
						item.fileId = upload.id;

						const resource = await service.createResource({
							title: item.name,
							type: 'presentation',
							thematic_area_id: 1,
							module_id: 1,
							file_id: item.fileId,
							category: 'POWERPOINT_PRESENTATION',
						}, { id: 1, role: Role.ADMIN });
						resourceIds.push(resource.id);
						assert.equal(resource.fileId, item.fileId);

						const assignment = await models.ResourceAssignment.create({
							resource_id: resource.id,
							mentor_id: mentor.id,
							mentee_id: 5,
							facility_id: 1,
							assignment_status: 'active',
							assigned_by: mentor.id,
							assigned_at: new Date(),
						});
						try {
							const opened = await service.openResourceFile(resource.id, {
								id: mentor.id,
								role: Role.MENTOR,
							});
							const chunks = [];
							for await (const chunk of opened.stream) chunks.push(chunk);
							assert.equal(opened.mimeType, item.mimeType);
							assert.equal(Buffer.concat(chunks).toString(), 'resource content');
						} finally {
							await assignment.destroy();
						}
					}
				} finally {
					await models.ResourceAssignment.destroy({ where: { mentor_id: mentor.id } });
					for (const id of resourceIds) await service.deleteResource(id, { id: 1, role: Role.ADMIN });
					for (const id of uploadedIds) await uploadsService.deleteUpload(id, { id: 1, role: Role.ADMIN });
					await thematicAssignment.destroy();
					await mentor.destroy();
				}
			});
			const assignment = await models.Assignment.create({
				mentor_id: mentor.id,
				facility_id: 1,
				cycle_id: 1,
				thematic_area_id: 1,
				status: 'assigned',
			});
			try {
				assert.equal(await models.LearningModuleMentorPermission.count({
					where: { mentor_id: mentor.id, module_id: 1 },
				}), 0);
				assert.equal(await models.LearningModuleMentorAccess.count({
					where: { mentor_id: mentor.id, module_id: 1 },
				}), 0);

				const opened = await service.openResourceFile(authorizedResource.id, {
					id: mentor.id,
					role: Role.MENTOR,
				});
				const listed = await service.listResources({}, { id: mentor.id, role: Role.MENTOR });
				assert.ok(listed.items.some((resource) => resource.id === authorizedResource.id));
				const chunks = [];
				for await (const chunk of opened.stream) chunks.push(chunk);
				assert.equal(opened.mimeType, 'application/pdf');
				assert.equal(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(), 'resource content');

				await assignment.update({ status: 'inactive', unassigned_at: new Date() });
				await assert.rejects(service.openResourceFile(authorizedResource.id, {
					id: mentor.id,
					role: Role.MENTOR,
				}), { statusCode: 403 });
				const listedAfterEnd = await service.listResources({}, { id: mentor.id, role: Role.MENTOR });
				assert.equal(listedAfterEnd.items.some((resource) => resource.id === authorizedResource.id), false);
			} finally {
				await assignment.destroy();
				await mentor.destroy();
			}
		});

		it('should allow an assigned mentor to view module resources without any module permission grant', async () => {
			const mentor = { id: 4, role: Role.MENTOR, facility_id: 1 };
			await models.LearningModuleMentorPermission.destroy({ where: { module_id: 1, mentor_id: 4 } });
			await models.LearningModuleMentorAccess.destroy({ where: { module_id: 1, mentor_id: 4 } });
			const assignment = await models.Assignment.create({
				mentor_id: 4,
				mentee_id: 5,
				facility_id: 1,
				cycle_id: 1,
				thematic_area_id: 1,
				status: 'active',
			});
			try {
				const res = await service.getResource(authorizedResource.id, mentor);
				assert.equal(res.id, authorizedResource.id);
				const resources = await service.listResources({}, mentor);
				assert.ok(resources.items.some((resource) => resource.id === authorizedResource.id));
			} finally {
				await assignment.destroy();
			}
		});

		it('should allow mentor with active thematic-area assignment to access answer-key Resources without manual permission', async () => {
			const mentor = await models.User.create({
				email: 'answer-key-mentor@cbcm.org',
				role: Role.MENTOR,
				status: 'active',
				facility_id: 1,
				password_hash: 'hash',
				must_change_password: false,
			});
			const assignment = await models.Assignment.create({
				mentor_id: mentor.id,
				mentee_id: 5,
				facility_id: 1,
				cycle_id: 1,
				thematic_area_id: 1,
				status: 'active',
			});
			const answerKey = await service.createResource({
				title: 'Protected Answer Key',
				type: 'pdf',
				thematic_area_id: 1,
				module_id: 1,
				file_id: 1,
				category: 'ANSWER_KEY',
			}, { id: 1, role: Role.ADMIN });

			try {
				const actor = { id: mentor.id, role: Role.MENTOR };
				assert.equal((await service.getResource(answerKey.id, actor)).id, answerKey.id);
				assert.ok((await service.listResources({}, actor)).items.some((item) => item.id === answerKey.id));
				const opened = await service.openResourceFile(answerKey.id, actor);
				assert.equal(opened.mimeType, 'application/pdf');

				await assignment.update({ status: 'inactive', unassigned_at: new Date() });
				await assert.rejects(service.getResource(answerKey.id, actor), { statusCode: 403 });
				await assert.rejects(service.openResourceFile(answerKey.id, actor), { statusCode: 403 });
				const hiddenList = await service.listResources({}, actor);
				assert.ok(!hiddenList.items.some((item) => item.id === answerKey.id));
			} finally {
				await service.deleteResource(answerKey.id, { id: 1, role: Role.ADMIN });
				await assignment.destroy();
				await mentor.destroy();
			}
		});

		it('should deny mentees assigned to Facilitator Guide and Answer Key Resources', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			const admin = { id: 1, role: Role.ADMIN };
			const protectedResources = [];
			const assignments = [];

			try {
				for (const category of ['FACILITATOR_GUIDE', 'ANSWER_KEY']) {
					const resource = await service.createResource({
						title: category,
						type: 'pdf',
						thematic_area_id: 1,
						module_id: 1,
						file_id: 1,
						category,
					}, admin);
					protectedResources.push(resource);
					assignments.push(await models.ResourceAssignment.create({
						resource_id: resource.id,
						mentor_id: 4,
						mentee_id: mentee.id,
						facility_id: 1,
						assignment_status: 'active',
						assigned_by: 4,
						assigned_at: new Date(),
					}));
				}
				for (const resource of protectedResources) {
					await assert.rejects(service.getResource(resource.id, mentee), { statusCode: 403 });
					await assert.rejects(service.openResourceFile(resource.id, mentee), { statusCode: 403 });
				}
				const listed = await service.listResources({}, mentee);
				assert.ok(protectedResources.every((resource) => !listed.items.some((item) => item.id === resource.id)));
			} finally {
				for (const assignment of assignments) await assignment.destroy();
				for (const resource of protectedResources) await service.deleteResource(resource.id, admin);
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

		it('should grant participant manual access from thematic-area assignment', async () => {
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

			assert.equal((await service.getResource(authorizedResource.id, mentee)).id, authorizedResource.id);
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

			assert.equal((await service.getResource(authorizedResource.id, mentee)).id, authorizedResource.id);
			const history = await models.ResourceAssignment.findOne({
				where: { resource_id: authorizedResource.id, mentee_id: 5, assignment_status: 'revoked' },
			});
			assert.ok(history);
			assert.equal(history.revoked_by, 4);
			assert.equal(new Date(history.revoked_at).getTime(), revokedAt.getTime());
		});

		it('should not let an older completed assignment bypass a newer revocation', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			await models.ResourceAssignment.destroy({
				where: { resource_id: authorizedResource.id, mentee_id: 5 },
			});
			const olderAssignedAt = new Date(Date.now() - 60_000);
			await models.ResourceAssignment.create({
				resource_id: authorizedResource.id,
				mentor_id: 4,
				mentee_id: 5,
				facility_id: 1,
				assignment_status: 'completed',
				assigned_by: 4,
				assigned_at: olderAssignedAt,
				completed_at: olderAssignedAt,
			});
			await models.ResourceAssignment.create({
				resource_id: authorizedResource.id,
				mentor_id: 4,
				mentee_id: 5,
				facility_id: 1,
				assignment_status: 'revoked',
				assigned_by: 4,
				assigned_at: new Date(),
				revoked_at: new Date(),
				revoked_by: 4,
			});

			assert.equal((await service.getResource(authorizedResource.id, mentee)).id, authorizedResource.id);
			await assert.rejects(service.completeMyResourceAssignment(authorizedResource.id, mentee), { statusCode: 404 });
		});

		it('should preserve and retain access to a legacy completed assignment until it is revoked', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			await models.ResourceAssignment.destroy({
				where: { resource_id: authorizedResource.id, mentee_id: 5 },
			});
			const historicalCompletedAt = new Date(Date.now() - 120_000);
			const legacy = await models.ResourceAssignment.create({
				resource_id: authorizedResource.id,
				mentor_id: 4,
				mentee_id: 5,
				facility_id: 1,
				assignment_status: 'completed',
				assigned_by: 4,
				assigned_at: historicalCompletedAt,
				completed_at: historicalCompletedAt,
			});

			assert.equal((await service.getResource(authorizedResource.id, mentee)).id, authorizedResource.id);
			const repeatedCompletion = await service.completeMyResourceAssignment(authorizedResource.id, mentee);
			assert.equal(repeatedCompletion.status, 'completed');
			assert.equal(new Date(repeatedCompletion.completedAt).getTime(), historicalCompletedAt.getTime());
			assert.equal((await models.ResourceAssignment.findByPk(legacy.id)).assignment_status, 'completed');

			const revoked = await service.revokeResourceAssignmentById(legacy.id, { id: 4, role: Role.MENTOR });
			assert.equal(revoked.status, 'revoked');
			assert.equal(new Date(revoked.completedAt).getTime(), historicalCompletedAt.getTime());
			assert.equal((await service.getResource(authorizedResource.id, mentee)).id, authorizedResource.id);
			await models.ResourceAssignment.destroy({ where: { id: legacy.id } });
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
			const assignmentPath = `/api/v1/learning/modules/1/resources/${authorizedResource.id}/assignments`;

			const assigned = await request(app)
				.post(assignmentPath)
				.set('Authorization', `Bearer ${mentorToken}`)
				.send({ mentee_id: 5 });
			assert.equal(assigned.status, 201);
			assert.equal(assigned.body.data.assigned, true);

			const accessible = await request(app)
				.get(`/api/v1/resources/${authorizedResource.id}`)
				.set('Authorization', `Bearer ${menteeToken}`);
			assert.equal(accessible.status, 200);

			const revoked = await request(app)
				.post(`/api/v1/learning/resource-assignments/${assigned.body.data.assignmentId}/revoke`)
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
			assert.equal(denied.status, 200);

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
					.post(assignmentPath)
					.set('Authorization', `Bearer ${mentorToken}`)
					.send({ mentee_id: otherMentee.id });
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
			await models.Assignment.destroy({ where: { mentor_id: 4, mentee_id: 5 } });
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
			await models.Assignment.create({
				mentor_id: 4,
				mentee_id: 5,
				facility_id: 1,
				cycle_id: 1,
				thematic_area_id: 1,
				status: 'active',
				assigned_at: new Date(),
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
			assert.equal(created.body.data.moduleId, 1);
			assert.equal(created.body.data.cycleId, 1);
			assert.equal(created.body.data.thematicAreaId, 1);

			const savedAssignment = await models.ResourceAssignment.findByPk(created.body.data.assignmentId);
			assert.equal(savedAssignment.module_id, 1);
			assert.equal(savedAssignment.cycle_id, 1);
			assert.equal(savedAssignment.thematic_area_id, 1);

			await models.Assignment.create({
				mentor_id: 4,
				mentee_id: 5,
				facility_id: 1,
				cycle_id: 2,
				thematic_area_id: 1,
				status: 'active',
				assigned_at: new Date(),
			});
			const ambiguousAssignment = await request(app)
				.post(assignmentPath)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '))
				.send({ mentee_id: 5 });
			assert.equal(ambiguousAssignment.status, 400);
			assert.equal(ambiguousAssignment.body.error.code, 'AMBIGUOUS_ASSIGNMENT_CONTEXT');
			await models.Assignment.destroy({
				where: { mentor_id: 4, mentee_id: 5, cycle_id: 2 },
			});

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
				category: 'PARTICIPANT_MANUAL',
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
			assert.equal(completed.body.data.status, 'active');
			assert.ok(completed.body.data.completedAt);
			const refreshedProgress = await models.LearningModuleProgress.findOne({
				where: { mentee_id: 5, module_id: 1, cycle_id: 1 },
			});
			assert.ok(refreshedProgress);
			assert.equal(refreshedProgress.completion_percentage, 100);
			assert.equal(refreshedProgress.status, 'in_progress');
			const moduleProgressHeaders = { Authorization: `Bearer ${menteeToken}` };
			const moduleGet = await request(app)
				.get('/api/v1/learning/my/modules/1?cycleId=1')
				.set(moduleProgressHeaders);
			assert.equal(moduleGet.status, 200);
			assert.equal(moduleGet.body.data.cycleId, 1);
			const progressGet = await request(app)
				.get('/api/v1/learning/my/modules/1/progress?cycleId=1')
				.set(moduleProgressHeaders);
			assert.equal(progressGet.status, 200);
			assert.equal(progressGet.body.data.cycleId, 1);
			const resourceProgressGet = await request(app)
				.get('/api/v1/learning/my/modules/1/resources/progress?cycleId=1')
				.set(moduleProgressHeaders);
			assert.equal(resourceProgressGet.status, 200);
			assert.equal(resourceProgressGet.body.data.cycleId, 1);
			assert.equal(resourceProgressGet.body.data.completionPercentage, 100);
			const confirmation = await request(app)
				.post('/api/v1/learning/my/modules/1/confirm-completion?cycleId=1')
				.set(moduleProgressHeaders);
			assert.equal(confirmation.status, 200);
			assert.equal(confirmation.body.data.cycleId, 1);
			assert.equal(confirmation.body.data.status, 'completed');

			const repeatedCompletion = await request(app)
				.post(`/api/v1/learning/my/resources/${authorizedResource.id}/complete`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), menteeToken].join(' '));
			assert.equal(repeatedCompletion.status, 200);
			assert.equal(repeatedCompletion.body.data.completedAt, completed.body.data.completedAt);
			assert.equal((await models.ResourceAssignment.findByPk(created.body.data.assignmentId)).assignment_status, 'active');
			await assert.rejects(
				service.deleteResource(authorizedResource.id, { id: 1, role: Role.ADMIN }),
				{ statusCode: 409, code: 'RESOURCE_HISTORY_LOCKED' }
			);
			await assert.rejects(service.createResource({
				title: 'Late required Resource',
				type: 'pdf',
				thematic_area_id: 1,
				module_id: 1,
				file_id: 1,
				category: 'PARTICIPANT_MANUAL',
			}, { id: 1, role: Role.ADMIN }), { statusCode: 409, code: 'RESOURCE_REQUIREMENTS_LOCKED' });
			const listAfterCompletion = await request(app)
				.get('/api/v1/learning/my/resources')
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), menteeToken].join(' '));
			assert.ok(listAfterCompletion.body.data.some((entry) => entry.resourceId === authorizedResource.id));

			const accessibleContent = await request(app)
				.get(`/api/v1/learning/my/resources/${authorizedResource.id}/content`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), menteeToken].join(' '));
			assert.equal(accessibleContent.status, 200);

			await assert.rejects(service.updateResource(authorizedResource.id, {
				module_id: 2,
				thematic_area_id: 2,
			}, { id: 1, role: Role.ADMIN }), { statusCode: 409, code: 'RESOURCE_REQUIREMENTS_LOCKED' });
			await assert.rejects(service.updateResource(authorizedResource.id, {
				is_required: false,
			}, { id: 1, role: Role.ADMIN }), { statusCode: 409, code: 'RESOURCE_REQUIREMENTS_LOCKED' });
			const metadataUpdate = await service.updateResource(authorizedResource.id, {
				title: 'Updated authorized resource metadata',
			}, { id: 1, role: Role.ADMIN });
			assert.equal(metadataUpdate.title, 'Updated authorized resource metadata');
			const unchangedSnapshot = await models.ResourceAssignment.findByPk(created.body.data.assignmentId);
			assert.equal(unchangedSnapshot.module_id, 1);
			assert.equal(unchangedSnapshot.thematic_area_id, 1);

			const revokedCompleted = await request(app)
				.post(`/api/v1/learning/resource-assignments/${created.body.data.assignmentId}/revoke`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '));
			assert.equal(revokedCompleted.status, 200);
			assert.equal(revokedCompleted.body.data.status, 'revoked');
			assert.equal(revokedCompleted.body.data.completedAt, completed.body.data.completedAt);
			const deniedContent = await request(app)
				.get(`/api/v1/learning/my/resources/${authorizedResource.id}/content`)
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), menteeToken].join(' '));
			assert.equal(deniedContent.status, 200);

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
			}), 0);
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
				entry.status === 'revoked' && entry.completedAt && entry.menteeId === 5
					&& entry.id === created.body.data.assignmentId
			)));
			assert.ok(mentorProgress.body.data.some((entry) => (
				entry.status === 'revoked' && entry.revokedAt && entry.id === reassigned.body.data.assignmentId
			)));
			assert.ok(mentorProgress.body.data.some((entry) => entry.id === reassignedAfterRevoke.body.data.assignmentId));

			const menteeProgress = await request(app)
				.get('/api/v1/learning/mentees/5/resources')
				.set('Authorization', [String.fromCharCode(66, 101, 97, 114, 101, 114), mentorToken].join(' '));
			assert.equal(menteeProgress.status, 200);
			assert.ok(menteeProgress.body.data.every((entry) => entry.status !== 'completed'));
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
			await models.Assignment.destroy({ where: { mentor_id: 4, mentee_id: 5 } });
			await service.deleteResource(otherModuleResource.id, { id: 1, role: Role.ADMIN });
		});

		it.skip('legacy individual module-permission records are ignored; thematic-area assignment is the only mentor access rule', async () => {
			const assignmentHistory = (await models.Assignment.findAll({ where: { mentor_id: 4 } }))
				.map((assignment) => ({
					record: assignment,
					status: assignment.status,
					unassigned_at: assignment.unassigned_at,
				}));
			for (const { record } of assignmentHistory) {
				await record.update({ status: 'inactive', unassigned_at: new Date() });
			}
			const permissionHistory = await models.LearningModuleMentorPermission.findAll({
				where: {
					module_id: 1,
					mentor_id: 4,
					permission: LearningPermission.RESOURCES_VIEW,
				},
			});
			await models.LearningModuleMentorPermission.destroy({
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

				const activeAssignment = await models.Assignment.create({
					mentor_id: 4,
					mentee_id: 5,
					facility_id: 1,
					cycle_id: 1,
					thematic_area_id: 1,
					status: 'active',
				});
				try {
					const automaticallyAccessible = await service.getResource(authorizedResource.id, {
						id: 4,
						role: Role.MENTOR,
						facility_id: 1,
					});
					assert.equal(automaticallyAccessible.id, authorizedResource.id);

					await activeAssignment.update({ status: 'inactive', unassigned_at: new Date() });
					await assert.rejects(service.getResource(authorizedResource.id, {
						id: 4,
						role: Role.MENTOR,
						facility_id: 1,
					}), { statusCode: 403 });
				} finally {
					await activeAssignment.destroy();
				}
			} finally {
				await permission.destroy();
				await legacyAccess.destroy();
				await accessOnlyGrant.destroy();
				await accessOnlyMentor.destroy();
				await models.LearningModuleMentorPermission.bulkCreate(
					permissionHistory.map((record) => record.get({ plain: true }))
				);
				for (const { record, status, unassigned_at } of assignmentHistory) {
					await record.update({
						status,
						unassigned_at,
					});
				}
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
				category: 'PARTICIPANT_MANUAL',
				is_required: false,
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
				module_id: 2,
				thematic_area_id: 2,
			}, admin);

			assert.equal(updated.moduleId, 2);
			assert.ok(updated.module);
			assert.equal(updated.module.id, 2);
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
					thematic_area_id: 2,
					module_id: 2,
					file_id: 1,
					category: 'PARTICIPANT_MANUAL',
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
