process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'landing-page-tests-access-secret';

const assert = require('node:assert/strict');
const { after, before, beforeEach, describe, it } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { DataTypes, Sequelize } = require('sequelize');
const models = require('../../src/models');
const Role = require('../../src/enums/role.enum');
const landingPageRoutes = require('../../src/routes/landing-page.routes');
const { errorHandler } = require('../../src/middlewares/error-handler.middleware');
const migration = require('../../src/database/migrations/20261119000000-create-landing-page-content');
const { isLandingPageContent } = require('../../src/validators/landing-page.validator');

const app = express();
app.use(express.json());
app.use('/api/v1/landing-page', landingPageRoutes);
app.use(errorHandler);

function tokenFor(user) {
	return jwt.sign({
		sub: user.id,
		token_use: 'access',
		password_version: 0,
	}, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
}

function landingContent() {
	return {
		hero: {
			eyebrow: 'Program',
			title: 'Clinical Skills',
			highlight: 'Saving Lives',
			description: 'A mentorship program.',
			image_url: '/image.png',
			image_alt: 'Mentors',
			connected_badge: '12 Hospitals',
			verification_title: 'Theory Score: 85%',
			verification_label: 'Pass',
			verification_description: 'Verified',
			proof_points: ['Facility cohorts'],
		},
		how_it_works: {
			eyebrow: 'Workflow',
			title: 'How it works',
			highlight: 'Together',
			description: 'Three steps.',
			cards: [{
				id: 'card-1',
				step: 'Step 1',
				status: 'Live',
				category: 'Assessment',
				title: 'Clinical assessment',
				description: 'Assess skills.',
				image_url: '/image2.jpg',
				image_alt: 'Assessment',
				features: ['Feedback'],
			}],
		},
		roles: {
			eyebrow: 'Roles',
			title: 'A platform',
			highlight: 'for everyone',
			description: 'Role-based access.',
			cards: [{
				id: 'mentor',
				label: 'Mentor',
				eyebrow: 'Preceptor',
				title: 'Coach midwives',
				description: 'Mentorship.',
				image_url: '/image1.jpg',
				image_alt: 'Mentor',
				caption: 'Clinical team',
				subcaption: 'Competency',
				highlights: [{ title: 'Assess', description: 'Review skills.' }],
				feature_cards: [],
			}],
		},
		impact: {
			eyebrow: 'Impact',
			title: 'Healthcare capacity',
			description: 'Positive impact.',
			stats: [{ id: 'hospitals', value: 12, suffix: '+', label: 'Hospitals', description: 'Teaching facilities' }],
			cta: {
				eyebrow: 'Portal',
				title: 'Access your dashboard',
				description: 'Sign in.',
				button_label: 'Log in',
			},
		},
	};
}

describe('Landing page API', () => {
	let users;

	before(async () => {
		await models.sequelize.sync({ force: true });
		users = {};
		for (const [key, role] of Object.entries({
			admin: Role.ADMIN,
			facilityAdmin: Role.FACILITY_ADMIN,
			mentor: Role.MENTOR,
		})) {
			users[key] = await models.User.create({
				full_name: key,
				email: `${key}@landing-page-test.invalid`,
				role,
				status: 'active',
				password_hash: 'test-hash',
				must_change_password: false,
			});
		}
	});

	beforeEach(async () => {
		await models.LandingPageContent.destroy({ where: {} });
		await models.LandingPageContent.create({
			id: 1,
			content: landingContent(),
			updated_by: null,
		});
	});

	after(async () => {
		await models.sequelize.close();
	});

	it('migration creates and seeds the landing page singleton and rolls back', async () => {
		const isolated = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
		const queryInterface = isolated.getQueryInterface();
		try {
			await queryInterface.createTable('users', {
				id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
			});
			await migration.up(queryInterface, Sequelize);
			const columns = await queryInterface.describeTable('landing_page_contents');
			assert.ok(columns.content);
			assert.ok(columns.updated_by);
			const [rows] = await isolated.query('SELECT id, content FROM landing_page_contents');
			assert.equal(rows.length, 1);
			const content = JSON.parse(rows[0].content);
			assert.equal(isLandingPageContent(content), true);
			assert.equal(content.hero.connected_badge, '12 Hospitals Connected');
			assert.equal(content.roles.cards.length, 4);
			await migration.down(queryInterface);
			const tables = await queryInterface.showAllTables();
			assert.equal(tables.some((table) => String(table).toLowerCase() === 'landing_page_contents'), false);
		} finally {
			await isolated.close();
		}
	});

	it('serves the configured landing content without requiring authentication', async () => {
		const response = await request(app).get('/api/v1/landing-page');
		assert.equal(response.status, 200);
		assert.equal(response.headers['cache-control'], 'no-store');
		assert.equal(response.body.data.content.hero.title, 'Clinical Skills');
		assert.equal(response.body.data.content.impact.stats[0].value, 12);
	});

	it('allows only Super Admins to update content and immediately returns the saved values', async () => {
		const adminAuth = { Authorization: `Bearer ${tokenFor(users.admin)}` };
		const content = landingContent();
		content.hero.connected_badge = '18 Hospitals Connected';

		const response = await request(app)
			.patch('/api/v1/landing-page/admin')
			.set(adminAuth)
			.send({ content });
		assert.equal(response.status, 200);
		assert.equal(response.body.data.content.hero.connected_badge, '18 Hospitals Connected');

		content.how_it_works.cards = [];
		content.roles.cards = [];
		content.impact.stats = [];
		const deleteResponse = await request(app)
			.patch('/api/v1/landing-page/admin')
			.set(adminAuth)
			.send({ content });
		assert.equal(deleteResponse.status, 200);
		assert.deepEqual(deleteResponse.body.data.content.how_it_works.cards, []);
		assert.deepEqual(deleteResponse.body.data.content.roles.cards, []);
		assert.deepEqual(deleteResponse.body.data.content.impact.stats, []);

		const publicResponse = await request(app).get('/api/v1/landing-page');
		assert.equal(publicResponse.body.data.content.hero.connected_badge, '18 Hospitals Connected');
		assert.deepEqual(publicResponse.body.data.content.how_it_works.cards, []);

		for (const user of [users.facilityAdmin, users.mentor]) {
			const result = await request(app)
				.patch('/api/v1/landing-page/admin')
				.set({ Authorization: `Bearer ${tokenFor(user)}` })
				.send({ content: landingContent() });
			assert.equal(result.status, 403);
		}
	});

	it('rejects invalid image protocols and unsupported fields', async () => {
		const adminAuth = { Authorization: `Bearer ${tokenFor(users.admin)}` };
		const badImage = landingContent();
		badImage.hero.image_url = 'javascript:alert(1)';
		const invalidImageResponse = await request(app)
			.patch('/api/v1/landing-page/admin')
			.set(adminAuth)
			.send({ content: badImage });
		assert.equal(invalidImageResponse.status, 400);

		const unknownFieldResponse = await request(app)
			.patch('/api/v1/landing-page/admin')
			.set(adminAuth)
			.send({ content: landingContent(), other: true });
		assert.equal(unknownFieldResponse.status, 400);
	});
});
