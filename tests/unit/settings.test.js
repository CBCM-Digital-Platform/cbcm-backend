// tests/unit/settings.test.js
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const models = require('../../src/models');

const Role = require('../../src/enums/role.enum');
const AppError = require('../../src/errors/app-error');
const service = require('../../src/services/settings.service');
const repository = require('../../src/repositories/settings.repository');

describe('Settings (FAQs and Guides)', () => {
	let testUsers = [];

	before(async () => {
		await models.sequelize.sync();
		await models.Facility.create({ id: 1, name: 'Test Facility 1', type: 'Hospital' });
		await models.Facility.create({ id: 2, name: 'Test Facility 2', type: 'Hospital' });
		testUsers = await models.User.bulkCreate([
			{ id: 1, email: 'admin@test.com', role: Role.ADMIN, status: 'active', password_hash: 'hash' },
			{ id: 2, email: 'facility-admin@test.com', role: Role.FACILITY_ADMIN, status: 'active', facility_id: 1, password_hash: 'hash' },
			{ id: 3, email: 'facility-admin-2@test.com', role: Role.FACILITY_ADMIN, status: 'active', facility_id: 2, password_hash: 'hash' },
			{ id: 4, email: 'mentor@test.com', role: Role.MENTOR, status: 'active', facility_id: 1, password_hash: 'hash' },
			{ id: 5, email: 'mentee@test.com', role: Role.MENTEE, status: 'active', facility_id: 1, password_hash: 'hash' },
		]);
	});

	after(async () => {
		await models.sequelize.close();
	});

	describe('FAQ Role Visibility', () => {
		it('should allow all roles to read FAQs with target_audience=all', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const mentor = { id: 4, role: Role.MENTOR, facility_id: 1 };
			const mentee = { id: 5, role: Role.MENTEE, facility_id: 1 };

			const faq = await service.createFaq(
				{ question: 'Test Q1', answer: 'Test A1', target_audience: 'all' },
				admin
			);

			const adminList = await service.listFaqs({}, admin);
			const mentorList = await service.listFaqs({}, mentor);
			const menteeList = await service.listFaqs({}, mentee);

			assert.ok(adminList.items.some((f) => f.id === faq.id));
			assert.ok(mentorList.items.some((f) => f.id === faq.id));
			assert.ok(menteeList.items.some((f) => f.id === faq.id));

			await service.deleteFaq(faq.id, admin);
		});

		it('should only allow mentors to read FAQs with target_audience=mentor', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const mentor = { id: 2, role: Role.MENTOR, facility_id: 1 };
			const mentee = { id: 3, role: Role.MENTEE, facility_id: 1 };

			const faq = await service.createFaq(
				{ question: 'Test Q2', answer: 'Test A2', target_audience: 'mentor' },
				admin
			);

			const adminList = await service.listFaqs({}, admin);
			const mentorList = await service.listFaqs({}, mentor);
			const menteeList = await service.listFaqs({}, mentee);

			assert.ok(adminList.items.some((f) => f.id === faq.id));
			assert.ok(mentorList.items.some((f) => f.id === faq.id));
			assert.ok(!menteeList.items.some((f) => f.id === faq.id));

			await service.deleteFaq(faq.id, admin);
		});

		it('should only allow mentees to read FAQs with target_audience=mentee', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const mentor = { id: 2, role: Role.MENTOR, facility_id: 1 };
			const mentee = { id: 3, role: Role.MENTEE, facility_id: 1 };

			const faq = await service.createFaq(
				{ question: 'Test Q3', answer: 'Test A3', target_audience: 'mentee' },
				admin
			);

		 const adminList = await service.listFaqs({}, admin);
			const mentorList = await service.listFaqs({}, mentor);
			const menteeList = await service.listFaqs({}, mentee);

			assert.ok(adminList.items.some((f) => f.id === faq.id));
			assert.ok(!mentorList.items.some((f) => f.id === faq.id));
			assert.ok(menteeList.items.some((f) => f.id === faq.id));

			await service.deleteFaq(faq.id, admin);
		});

		it('should prevent mentee from reading FAQ by ID if not in target_audience', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const mentee = { id: 3, role: Role.MENTEE, facility_id: 1 };

			const faq = await service.createFaq(
				{ question: 'Test Q4', answer: 'Test A4', target_audience: 'mentor' },
				admin
			);

			await assert.rejects(
				service.getFaq(faq.id, mentee),
				(err) => err instanceof AppError && err.statusCode === 403
			);

			await service.deleteFaq(faq.id, admin);
		});
	});

	describe('FAQ Authorization', () => {
		it('should allow System Admin to create FAQ', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const faq = await service.createFaq(
				{ question: 'Test Q5', answer: 'Test A5' },
				admin
			);
			assert.ok(faq.id);
			assert.strictEqual(faq.created_by, admin.id);
			await service.deleteFaq(faq.id, admin);
		});

		it('should allow Facility Admin to create FAQ with their facility_id', async () => {
			const facilityAdmin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const faq = await service.createFaq(
				{ question: 'Test Q6', answer: 'Test A6' },
				facilityAdmin
			);
			assert.ok(faq.id);
			assert.strictEqual(faq.facility_id, 1);
			assert.strictEqual(faq.created_by, facilityAdmin.id);
			await service.deleteFaq(faq.id, facilityAdmin);
		});

		it('should reject Mentor from creating FAQ', async () => {
			const mentor = { id: 3, role: Role.MENTOR, facility_id: 1 };
			await assert.rejects(
				service.createFaq({ question: 'Test Q7', answer: 'Test A7' }, mentor),
				(err) => err instanceof AppError && err.statusCode === 403
			);
		});

		it('should reject Mentee from creating FAQ', async () => {
			const mentee = { id: 4, role: Role.MENTEE, facility_id: 1 };
			await assert.rejects(
				service.createFaq({ question: 'Test Q8', answer: 'Test A8' }, mentee),
				(err) => err instanceof AppError && err.statusCode === 403
			);
		});

		it('should allow System Admin to update any FAQ', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const faq = await service.createFaq(
				{ question: 'Test Q9', answer: 'Test A9' },
				admin
			);
			const updated = await service.updateFaq(faq.id, { answer: 'Updated A9' }, admin);
			assert.strictEqual(updated.answer, 'Updated A9');
			await service.deleteFaq(faq.id, admin);
		});

		it('should allow Facility Admin to update their own facility FAQ', async () => {
			const facilityAdmin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const faq = await service.createFaq(
				{ question: 'Test Q10', answer: 'Test A10' },
				facilityAdmin
			);
			const updated = await service.updateFaq(faq.id, { answer: 'Updated A10' }, facilityAdmin);
			assert.strictEqual(updated.answer, 'Updated A10');
			await service.deleteFaq(faq.id, facilityAdmin);
		});

		it('should reject Facility Admin from updating system-wide FAQ (facility_id=null)', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const facilityAdmin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };

			const faq = await service.createFaq(
				{ question: 'Test Q11', answer: 'Test A11', facility_id: null },
				admin
			);

			await assert.rejects(
				service.updateFaq(faq.id, { answer: 'Updated A11' }, facilityAdmin),
				(err) => err instanceof AppError && err.statusCode === 403
			);

			await service.deleteFaq(faq.id, admin);
		});

		it('should reject Facility Admin from updating another facility FAQ', async () => {
			const facilityAdmin1 = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const facilityAdmin2 = { id: 3, role: Role.FACILITY_ADMIN, facility_id: 2 };

			const faq = await service.createFaq(
				{ question: 'Test Q12', answer: 'Test A12' },
				facilityAdmin1
			);

			await assert.rejects(
				service.updateFaq(faq.id, { answer: 'Updated A12' }, facilityAdmin2),
				(err) => err instanceof AppError && err.statusCode === 403
			);

			await service.deleteFaq(faq.id, facilityAdmin1);
		});

		it('should allow System Admin to delete any FAQ', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const faq = await service.createFaq(
				{ question: 'Test Q13', answer: 'Test A13' },
				admin
			);
			await service.deleteFaq(faq.id, admin);
			const deleted = await repository.findFaqById(faq.id);
			assert.strictEqual(deleted, null);
		});

		it('should allow Facility Admin to delete their own facility FAQ', async () => {
			const facilityAdmin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const faq = await service.createFaq(
				{ question: 'Test Q14', answer: 'Test A14' },
				facilityAdmin
			);
			await service.deleteFaq(faq.id, facilityAdmin);
			const deleted = await repository.findFaqById(faq.id);
			assert.strictEqual(deleted, null);
		});

		it('should reject Facility Admin from deleting system-wide FAQ', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const facilityAdmin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };

			const faq = await service.createFaq(
				{ question: 'Test Q15', answer: 'Test A15', facility_id: null },
				admin
			);

			await assert.rejects(
				service.deleteFaq(faq.id, facilityAdmin),
				(err) => err instanceof AppError && err.statusCode === 403
			);

			await service.deleteFaq(faq.id, admin);
		});
	});

	describe('Guide Role Visibility', () => {
		it('should allow all roles to read guides with target_audience=all', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const mentor = { id: 2, role: Role.MENTOR, facility_id: 1 };
			const mentee = { id: 3, role: Role.MENTEE, facility_id: 1 };

			const guide = await service.createGuide(
				{ title: 'Test Guide 1', content: 'Content 1', target_audience: 'all' },
				admin
			);

			const adminList = await service.listGuides({}, admin);
			const mentorList = await service.listGuides({}, mentor);
			const menteeList = await service.listGuides({}, mentee);

			assert.ok(adminList.items.some((g) => g.id === guide.id));
			assert.ok(mentorList.items.some((g) => g.id === guide.id));
			assert.ok(menteeList.items.some((g) => g.id === guide.id));

			await service.deleteGuide(guide.id, admin);
		});

		it('should only allow mentors to read guides with target_audience=mentor', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const mentor = { id: 2, role: Role.MENTOR, facility_id: 1 };
			const mentee = { id: 3, role: Role.MENTEE, facility_id: 1 };

			const guide = await service.createGuide(
				{ title: 'Test Guide 2', content: 'Content 2', target_audience: 'mentor' },
				admin
			);

			const adminList = await service.listGuides({}, admin);
			const mentorList = await service.listGuides({}, mentor);
			const menteeList = await service.listGuides({}, mentee);

			assert.ok(adminList.items.some((g) => g.id === guide.id));
			assert.ok(mentorList.items.some((g) => g.id === guide.id));
			assert.ok(!menteeList.items.some((g) => g.id === guide.id));

			await service.deleteGuide(guide.id, admin);
		});

		it('should prevent mentee from reading guide by ID if not in target_audience', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const mentee = { id: 3, role: Role.MENTEE, facility_id: 1 };

			const guide = await service.createGuide(
				{ title: 'Test Guide 3', content: 'Content 3', target_audience: 'mentor' },
				admin
			);

			await assert.rejects(
				service.getGuide(guide.id, mentee),
				(err) => err instanceof AppError && err.statusCode === 403
			);

			await service.deleteGuide(guide.id, admin);
		});
	});

	describe('Guide Authorization', () => {
		it('should allow System Admin to create guide', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const guide = await service.createGuide(
				{ title: 'Test Guide 4', content: 'Content 4' },
				admin
			);
			assert.ok(guide.id);
			assert.strictEqual(guide.created_by, admin.id);
			await service.deleteGuide(guide.id, admin);
		});

		it('should allow Facility Admin to create guide with their facility_id', async () => {
			const facilityAdmin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };
			const guide = await service.createGuide(
				{ title: 'Test Guide 5', content: 'Content 5' },
				facilityAdmin
			);
			assert.ok(guide.id);
			assert.strictEqual(guide.facility_id, 1);
			assert.strictEqual(guide.created_by, facilityAdmin.id);
			await service.deleteGuide(guide.id, facilityAdmin);
		});

		it('should reject Mentor from creating guide', async () => {
			const mentor = { id: 3, role: Role.MENTOR, facility_id: 1 };
			await assert.rejects(
				service.createGuide({ title: 'Test Guide 6', content: 'Content 6' }, mentor),
				(err) => err instanceof AppError && err.statusCode === 403
			);
		});

		it('should reject Facility Admin from updating system-wide guide', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const facilityAdmin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };

			const guide = await service.createGuide(
				{ title: 'Test Guide 7', content: 'Content 7', facility_id: null },
				admin
			);

			await assert.rejects(
				service.updateGuide(guide.id, { content: 'Updated Content 7' }, facilityAdmin),
				(err) => err instanceof AppError && err.statusCode === 403
			);

			await service.deleteGuide(guide.id, admin);
		});

		it('should reject Facility Admin from deleting system-wide guide', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const facilityAdmin = { id: 2, role: Role.FACILITY_ADMIN, facility_id: 1 };

			const guide = await service.createGuide(
				{ title: 'Test Guide 8', content: 'Content 8', facility_id: null },
				admin
			);

			await assert.rejects(
				service.deleteGuide(guide.id, facilityAdmin),
				(err) => err instanceof AppError && err.statusCode === 403
			);

			await service.deleteGuide(guide.id, admin);
		});
	});

	describe('Validation and Error Handling', () => {
		it('should return 404 when FAQ not found', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			await assert.rejects(
				service.getFaq(99999, admin),
				(err) => err instanceof AppError && err.statusCode === 404
			);
		});

		it('should return 404 when guide not found', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			await assert.rejects(
				service.getGuide(99999, admin),
				(err) => err instanceof AppError && err.statusCode === 404
			);
		});

		it('should set created_by from authenticated user', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const faq = await service.createFaq(
				{ question: 'Test Q16', answer: 'Test A16' },
				admin
			);
			assert.strictEqual(faq.created_by, 1);
			await service.deleteFaq(faq.id, admin);
		});

		it('should set updated_by from authenticated user on update', async () => {
			const admin = { id: 1, role: Role.ADMIN, facility_id: null };
			const faq = await service.createFaq(
				{ question: 'Test Q17', answer: 'Test A17' },
				admin
			);
			const updated = await service.updateFaq(faq.id, { answer: 'Updated A17' }, admin);
			assert.strictEqual(updated.updated_by, 1);
			await service.deleteFaq(faq.id, admin);
		});
	});

describe('Guide Attachment Validation', () => {
	it('should create a guide without an attachment', async () => {
		const admin = { id: 1, role: Role.ADMIN, facility_id: null };
		const guide = await service.createGuide({ title: 'No Attach', content: 'Content' }, admin);
		assert.ok(guide.id);
		assert.ok(!guide.attachment_file_id);
		await service.deleteGuide(guide.id, admin);
	});

	it('should reject guide creation with a non-existent attachment_file_id', async () => {
		const admin = { id: 1, role: Role.ADMIN, facility_id: null };
		await assert.rejects(
			service.createGuide({ title: 'Bad Attach', content: 'Content', attachment_file_id: 999999 }, admin),
			(err) => err instanceof AppError && err.statusCode === 404
		);
	});

	it('should create a guide with a valid attachment_file_id', async () => {
		const admin = { id: 1, role: Role.ADMIN, facility_id: null };
		const file = await models.UploadedFile.create({ owner_id: admin.id, context: 'test', storage_key: 'k', mime_type: 'text/plain', size_bytes: 10 });
		const guide = await service.createGuide({ title: 'Good Attach', content: 'Content', attachment_file_id: file.id }, admin);
		assert.ok(guide.id);
		assert.strictEqual(guide.attachment_file_id, file.id);
		await service.deleteGuide(guide.id, admin);
	});
});
});

