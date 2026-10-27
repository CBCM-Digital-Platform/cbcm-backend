process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'hierarchical-resources-test-jwt-secret';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { Sequelize, DataTypes } = require('sequelize');
const express = require('express');
const request = require('supertest');

const models = require('../../src/models');
const Role = require('../../src/enums/role.enum');
const service = require('../../src/services/hierarchical-resources.service');
const storage = require('../../src/providers/storage.provider');
const hierarchicalResourcesRoutes = require('../../src/routes/hierarchical-resources.routes');
const { generateAccessToken } = require('../../src/utils/token.util');

describe('Hierarchical Resources API', () => {
	let app;
	let adminUser, facility1Admin, facility2Admin, mentorUser, menteeUser, otherMenteeUser;
	let facility1, facility2;
	let storageMock;

	before(async () => {
		await models.sequelize.sync({ force: true });

		app = express();
		app.use(express.json());
		app.use('/api/v1/hierarchical-resources', hierarchicalResourcesRoutes);

		facility1 = await models.Facility.create({
			id: 1,
			name: 'Facility Alpha',
			type: 'Hospital',
		});

		facility2 = await models.Facility.create({
			id: 2,
			name: 'Facility Beta',
			type: 'Clinic',
		});

		[adminUser, facility1Admin, facility2Admin, mentorUser, menteeUser, otherMenteeUser] = await models.User.bulkCreate([
			{ id: 1, email: 'admin@cbcm.org', role: Role.ADMIN, status: 'active', password_hash: 'hash', must_change_password: false },
			{ id: 2, email: 'facadmin1@cbcm.org', role: Role.FACILITY_ADMIN, status: 'active', facility_id: 1, password_hash: 'hash', must_change_password: false },
			{ id: 3, email: 'facadmin2@cbcm.org', role: Role.FACILITY_ADMIN, status: 'active', facility_id: 2, password_hash: 'hash', must_change_password: false },
			{ id: 4, email: 'mentor@cbcm.org', role: Role.MENTOR, status: 'active', facility_id: 1, password_hash: 'hash', must_change_password: false },
			{ id: 5, email: 'mentee@cbcm.org', role: Role.MENTEE, status: 'active', facility_id: 1, password_hash: 'hash', must_change_password: false },
			{ id: 6, email: 'othermentee@cbcm.org', role: Role.MENTEE, status: 'active', facility_id: 2, password_hash: 'hash', must_change_password: false },
		]);

		await models.Assignment.create({
			id: 1,
			mentor_id: 4,
			mentee_id: 5,
			facility_id: 1,
			cycle_id: 1,
			status: 'active',
		});

		storageMock = {
			storeCalls: [],
			getStorageProvider: () => ({
				name: 'mock',
				store: async (opts) => {
					storageMock.storeCalls.push(opts);
					return { storageKey: 'mock-key.pdf', sizeBytes: 100, mimeType: opts.mimeType };
				},
				open: async () => ({ storageKey: 'mock-key.pdf', sizeBytes: 100, stream: null }),
				remove: async (key) => ({ storageKey: key, deleted: true }),
			}),
		};
		storage.getStorageProvider = storageMock.getStorageProvider;
	});

	after(async () => {
		await models.sequelize.close();
	});

	describe('Super Admin Resource Creation', () => {
		it('should allow Super Admin to create a resource', async () => {
			const file = {
				buffer: Buffer.from('PDF content'),
				originalname: 'test.pdf',
				mimetype: 'application/pdf',
				size: 100,
			};

			const resource = await service.createResource(file, {
				title: 'Test Resource',
				description: 'Test description',
				publication_status: 'published',
			}, adminUser);

			assert.ok(resource.id);
			assert.equal(resource.title, 'Test Resource');
			assert.equal(resource.type, 'pdf');
			assert.equal(resource.publication_status, 'published');
		});

		it('should reject non-Super Admin from creating resources', async () => {
			const file = {
				buffer: Buffer.from('PDF content'),
				originalname: 'test.pdf',
				mimetype: 'application/pdf',
				size: 100,
			};

			await assert.rejects(
				service.createResource(file, { title: 'Test' }, facility1Admin),
				{ statusCode: 403 }
			);
		});
	});

	describe('Facility Grant Workflow', () => {
		let resource;

		before(async () => {
			const file = {
				buffer: Buffer.from('PDF content'),
				originalname: 'test.pdf',
				mimetype: 'application/pdf',
				size: 100,
			};
			resource = await service.createResource(file, {
				title: 'Test Resource',
				publication_status: 'published',
			}, adminUser);
		});

		it('should allow Super Admin to grant resource to facilities', async () => {
			const result = await service.grantToFacility(resource.id, [1, 2], adminUser);
			assert.equal(result.granted, 2);

			const hasAccess1 = await models.FacilityResourceGrant.findOne({
				where: { resource_id: resource.id, facility_id: 1, grant_status: 'active' },
			});
			assert.ok(hasAccess1);
		});

		it('should reject Facility Admin from granting to other facilities', async () => {
			await assert.rejects(
				service.grantToFacility(resource.id, [2], facility1Admin),
				{ statusCode: 403 }
			);
		});

		it('should allow Super Admin to revoke facility access', async () => {
			await service.grantToFacility(resource.id, [1], adminUser);
			const result = await service.revokeFromFacility(resource.id, 1, adminUser);
			assert.equal(result.revoked, true);

			const grant = await models.FacilityResourceGrant.findOne({
				where: { resource_id: resource.id, facility_id: 1 },
			});
			assert.equal(grant.grant_status, 'revoked');
		});
	});

	describe('Mentor Grant Workflow', () => {
		let resource;

		before(async () => {
			const file = {
				buffer: Buffer.from('PDF content'),
				originalname: 'test.pdf',
				mimetype: 'application/pdf',
				size: 100,
			};
			resource = await service.createResource(file, {
				title: 'Test Resource',
				publication_status: 'published',
			}, adminUser);
			await service.grantToFacility(resource.id, [1], adminUser);
		});

		it('should allow Facility Admin to grant resource to their facility mentors', async () => {
			const result = await service.grantToMentor(resource.id, [4], facility1Admin);
			assert.equal(result.granted, 1);

			const grant = await models.MentorResourceGrant.findOne({
				where: { resource_id: resource.id, mentor_id: 4, grant_status: 'active' },
			});
			assert.ok(grant);
		});

		it('should reject Facility Admin from granting to mentors outside their facility', async () => {
			await assert.rejects(
				service.grantToMentor(resource.id, [4], facility2Admin),
				{ statusCode: 403 }
			);
		});

		it('should reject granting to mentors without facility access', async () => {
			await service.revokeFromFacility(resource.id, 1, adminUser);
			await assert.rejects(
				service.grantToMentor(resource.id, [4], facility1Admin),
				{ statusCode: 403 }
			);
		});
	});

	describe('Mentee Assignment Workflow', () => {
		let resource;

		before(async () => {
			const file = {
				buffer: Buffer.from('PDF content'),
				originalname: 'test.pdf',
				mimetype: 'application/pdf',
				size: 100,
			};
			resource = await service.createResource(file, {
				title: 'Test Resource',
				publication_status: 'published',
			}, adminUser);
			await service.grantToFacility(resource.id, [1], adminUser);
			await service.grantToMentor(resource.id, [4], facility1Admin);
		});

		it('should allow Mentor to assign resource to their mentees', async () => {
			const result = await service.assignToMentee(resource.id, [5], mentorUser);
			assert.equal(result.assigned, 1);

			const assignment = await models.MenteeResourceAssignment.findOne({
				where: { resource_id: resource.id, mentee_id: 5, assignment_status: 'active' },
			});
			assert.ok(assignment);
		});

		it('should reject Mentor from assigning to non-mentees', async () => {
			await assert.rejects(
				service.assignToMentee(resource.id, [6], mentorUser),
				{ statusCode: 403 }
			);
		});

		it('should reject Mentor without resource access', async () => {
			await service.revokeFromMentor(resource.id, 4, facility1Admin);
			await assert.rejects(
				service.assignToMentee(resource.id, [5], mentorUser),
				{ statusCode: 403 }
			);
		});
	});

	describe('Access Control and Revocation', () => {
		let resource;

		before(async () => {
			const file = {
				buffer: Buffer.from('PDF content'),
				originalname: 'test.pdf',
				mimetype: 'application/pdf',
				size: 100,
			};
			resource = await service.createResource(file, {
				title: 'Test Resource',
				publication_status: 'published',
			}, adminUser);
			await service.grantToFacility(resource.id, [1], adminUser);
			await service.grantToMentor(resource.id, [4], facility1Admin);
			await service.assignToMentee(resource.id, [5], mentorUser);
		});

		it('should allow mentee to access assigned resource', async () => {
			const result = await service.getResource(resource.id, menteeUser);
			assert.equal(result.id, resource.id);
		});

		it('should reject mentee from accessing unassigned resource', async () => {
			await assert.rejects(
				service.getResource(resource.id, otherMenteeUser),
				{ statusCode: 404 }
			);
		});

		it('should invalidate mentee access when mentor grant is revoked', async () => {
			await service.revokeFromMentor(resource.id, 4, facility1Admin);
			await assert.rejects(
				service.getResource(resource.id, menteeUser),
				{ statusCode: 404 }
			);
		});

		it('should invalidate mentee access when facility grant is revoked', async () => {
			await service.grantToMentor(resource.id, [4], facility1Admin);
			await service.assignToMentee(resource.id, [5], mentorUser);
			await service.revokeFromFacility(resource.id, 1, adminUser);
			await assert.rejects(
				service.getResource(resource.id, menteeUser),
				{ statusCode: 404 }
			);
		});
	});

	describe('Listing and Scoping', () => {
		let resource1, resource2;

		before(async () => {
			const file = {
				buffer: Buffer.from('PDF content'),
				originalname: 'test.pdf',
				mimetype: 'application/pdf',
				size: 100,
			};
			resource1 = await service.createResource(file, {
				title: 'Resource 1',
				publication_status: 'published',
			}, adminUser);
			resource2 = await service.createResource(file, {
				title: 'Resource 2',
				publication_status: 'published',
			}, adminUser);

			await service.grantToFacility(resource1.id, [1], adminUser);
			await service.grantToFacility(resource2.id, [2], adminUser);
			await service.grantToMentor(resource1.id, [4], facility1Admin);
			await service.assignToMentee(resource1.id, [5], mentorUser);
		});

		it('should return all resources to Super Admin', async () => {
			const result = await service.listResources({}, adminUser);
			assert.ok(result.items.some(r => r.id === resource1.id));
			assert.ok(result.items.some(r => r.id === resource2.id));
		});

		it('should return only facility-granted resources to Facility Admin', async () => {
			const result = await service.listResources({}, facility1Admin);
			assert.ok(result.items.some(r => r.id === resource1.id));
			assert.equal(result.items.some(r => r.id === resource2.id), false);
		});

		it('should return only mentor-granted resources to Mentor', async () => {
			const result = await service.listResources({}, mentorUser);
			assert.ok(result.items.some(r => r.id === resource1.id));
			assert.equal(result.items.some(r => r.id === resource2.id), false);
		});

		it('should return only assigned resources to Mentee', async () => {
			const result = await service.listResources({}, menteeUser);
			assert.ok(result.items.some(r => r.id === resource1.id));
			assert.equal(result.items.some(r => r.id === resource2.id), false);
		});
	});
});
