process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'resources-test-jwt-secret';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize, DataTypes } = require('sequelize');
const express = require('express');
const request = require('supertest');

const models = require('../../src/models');
const Role = require('../../src/enums/role.enum');
const LearningPermission = require('../../src/enums/learning-permission.enum');
const service = require('../../src/services/resources.service');
const repository = require('../../src/repositories/resources.repository');
const storage = require('../../src/providers/storage.provider');
const resourcesRoutes = require('../../src/routes/resources.routes');
const migration = require('../../src/database/migrations/20261023000000-add-module-id-to-resources');
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
				open: async () => ({ storageKey: 'mock-key.pdf', sizeBytes: 100, stream: null }),
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

		it('should allow facility admin to read resource in their facility scope', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const res = await service.getResource(facility1Resource.id, fac1Admin);
			assert.equal(res.id, facility1Resource.id);
		});

		it('should reject facility admin from reading resource outside facility scope (knowing ID does not grant access)', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			await assert.rejects(
				service.getResource(facility2Resource.id, fac1Admin),
				{ statusCode: 403 }
			);
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

		it('should enforce facility boundaries on listing resources', async () => {
			const fac1Admin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const list = await service.listResources({}, fac1Admin);

			assert.ok(list.items.some((r) => r.id === facility1Resource.id));
			assert.equal(list.items.some((r) => r.id === facility2Resource.id), false);
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

		it('should reject mentee when module is unpublished or unauthorized', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			await assert.rejects(
				service.getResource(draftModuleResource.id, mentee),
				{ statusCode: 403 }
			);
		});

		it('should reject mentee without module access (no progress record)', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			await models.LearningModuleProgress.destroy({ where: { mentee_id: 5, module_id: 1 } });
			await assert.rejects(
				service.getResource(authorizedResource.id, mentee),
				{ statusCode: 403 }
			);
		});

		it('should allow mentee to view resource when module is published and module access is granted', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			await models.LearningModuleProgress.create({
				mentee_id: 5,
				module_id: 1,
				status: 'in_progress',
				assigned_by: 4,
				assigned_at: new Date(),
			});

			const res = await service.getResource(authorizedResource.id, mentee);
			assert.equal(res.id, authorizedResource.id);
		});

		it('should filter resource list for mentee to only granted modules', async () => {
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };
			const list = await service.listResources({}, mentee);

			assert.ok(list.items.some((r) => r.id === authorizedResource.id));
			// Mentee has no access to module 2 or module 3
			assert.equal(list.items.some((r) => r.moduleId === 2), false);
			assert.equal(list.items.some((r) => r.moduleId === 3), false);
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
			assert.equal(res.url, 'https://legacy.example.org/docs/malaria-2020.pdf');
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
