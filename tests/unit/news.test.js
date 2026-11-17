process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'news-tests-access-secret';

const assert = require('node:assert/strict');
const { after, before, beforeEach, describe, it } = require('node:test');
const express = require('express');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { DataTypes, Sequelize } = require('sequelize');
const models = require('../../src/models');
const Role = require('../../src/enums/role.enum');
const newsRoutes = require('../../src/routes/news.routes');
const { errorHandler } = require('../../src/middlewares/error-handler.middleware');
const migration = require('../../src/database/migrations/20261112000000-create-news');

const app = express();
app.use(express.json());
app.use('/api/v1/news', newsRoutes);
app.use(errorHandler);

function tokenFor(user) {
	return jwt.sign({
		sub: user.id,
		token_use: 'access',
		password_version: 0,
	}, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });
}

function publishedNews(authorId, overrides = {}) {
	return {
		title: 'Public article',
		slug: 'public-article',
		summary: 'A public summary',
		content: 'Plain Markdown content',
		cover_image_url: 'https://example.test/cover.png',
		category: 'Updates',
		status: 'published',
		published_at: new Date(Date.now() - 60_000),
		author_id: authorId,
		...overrides,
	};
}

describe('News API', () => {
	let users;

	before(async () => {
		await models.sequelize.sync({ force: true });
		users = {};
		for (const [key, role] of Object.entries({
			admin: Role.ADMIN,
			facilityAdmin: Role.FACILITY_ADMIN,
			mentor: Role.MENTOR,
			mentee: Role.MENTEE,
		})) {
			users[key] = await models.User.create({
				full_name: key,
				email: `${key}@news-test.invalid`,
				role,
				status: 'active',
				password_hash: 'test-hash',
				must_change_password: false,
			});
		}
	});

	beforeEach(async () => {
		await models.News.destroy({ where: {} });
		await models.ActivityLog.destroy({ where: {} });
	});

	after(async () => {
		await models.sequelize.close();
	});

	it('migration creates its table and indexes and rolls back cleanly', async () => {
		const isolated = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false });
		const queryInterface = isolated.getQueryInterface();
		try {
			await queryInterface.createTable('users', {
				id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
			});
			await migration.up(queryInterface, Sequelize);
			const columns = await queryInterface.describeTable('news');
			assert.ok(columns.author_id);
			assert.ok(columns.slug);
			const indexes = await queryInterface.showIndex('news');
			assert.ok(indexes.some((index) => index.unique && index.fields.some((field) => field.attribute === 'slug')));
			assert.ok(indexes.some((index) => index.fields.length === 2));
			await migration.down(queryInterface);
			const tables = await queryInterface.showAllTables();
			assert.equal(tables.some((table) => String(table).toLowerCase() === 'news'), false);
		} finally {
			await isolated.close();
		}
	});

	it('anonymous list returns only current published items with public card fields', async () => {
		const past = new Date(Date.now() - 120_000);
		await models.News.bulkCreate([
			publishedNews(users.admin.id, { title: 'Older article', slug: 'older-article', published_at: past }),
			publishedNews(users.admin.id, { title: 'Newer article', slug: 'newer-article' }),
			{ ...publishedNews(users.admin.id), title: 'Draft article', slug: 'draft-article', status: 'draft' },
			{ ...publishedNews(users.admin.id), title: 'Archived article', slug: 'archived-article', status: 'archived' },
			{ ...publishedNews(users.admin.id), title: 'Scheduled article', slug: 'scheduled-article', published_at: new Date(Date.now() + 60_000) },
		]);

		const response = await request(app).get('/api/v1/news');
		assert.equal(response.status, 200);
		assert.equal(response.body.success, true);
		assert.equal(response.headers['cache-control'], 'public, max-age=60');
		assert.deepEqual(response.body.data.items.map((item) => item.slug), ['newer-article', 'older-article']);
		assert.equal(response.body.data.total, 2);
		assert.deepEqual(Object.keys(response.body.data.items[0]), [
			'id', 'title', 'slug', 'summary', 'cover_image_url', 'category', 'published_at',
		]);
		assert.equal(JSON.stringify(response.body).includes('news-test.invalid'), false);
	});

	it('anonymous detail hides draft and scheduled articles by either numeric id or slug', async () => {
		const draft = await models.News.create({
			...publishedNews(users.admin.id),
			status: 'draft',
			slug: 'hidden-draft',
		});
		await models.News.create({
			...publishedNews(users.admin.id),
			slug: 'hidden-scheduled',
			published_at: new Date(Date.now() + 60_000),
		});

		for (const identifier of [String(draft.id), 'hidden-draft', 'hidden-scheduled']) {
			const response = await request(app).get(`/api/v1/news/${identifier}`);
			assert.equal(response.status, 404);
			assert.equal(response.body.error.code, 'NEWS_NOT_FOUND');
		}
	});

	it('anonymous write requests return 401', async () => {
		assert.equal((await request(app).post('/api/v1/news').send({ title: 'Example news' })).status, 401);
		assert.equal((await request(app).patch('/api/v1/news/1').send({ status: 'draft' })).status, 401);
		assert.equal((await request(app).delete('/api/v1/news/1')).status, 401);
		assert.equal((await request(app).get('/api/v1/news/admin')).status, 401);
	});

	it('facility admins, mentors, and mentees cannot access administrative routes', async () => {
		for (const user of [users.facilityAdmin, users.mentor, users.mentee]) {
			const auth = { Authorization: `Bearer ${tokenFor(user)}` };
			const results = await Promise.all([
				request(app).get('/api/v1/news/admin').set(auth),
				request(app).post('/api/v1/news').set(auth).send({ title: 'Blocked news' }),
				request(app).patch('/api/v1/news/1').set(auth).send({ status: 'draft' }),
				request(app).delete('/api/v1/news/1').set(auth),
			]);
			assert.deepEqual(results.map((result) => result.status), [403, 403, 403, 403]);
		}
	});

	it('super admin can create, edit, publish, unpublish, and delete an article', async () => {
		const auth = { Authorization: `Bearer ${tokenFor(users.admin)}` };
		const created = await request(app).post('/api/v1/news').set(auth).send({
			title: 'Crème Brûlée Update',
			content: '## A safe Markdown article',
			summary: 'A short update',
		});
		assert.equal(created.status, 201);
		assert.equal(created.body.data.slug, 'creme-brulee-update');
		assert.equal(created.body.data.status, 'draft');
		assert.equal(created.body.data.author_id, users.admin.id);
		assert.equal(Object.hasOwn(created.body.data, 'email'), false);
		const id = created.body.data.id;

		const duplicate = await request(app).post('/api/v1/news').set(auth).send({
			title: 'Crème Brûlée Update',
			content: 'Another article',
		});
		assert.equal(duplicate.status, 201);
		assert.equal(duplicate.body.data.slug, 'creme-brulee-update-2');

		const edited = await request(app).patch(`/api/v1/news/${id}`).set(auth).send({
			title: 'Renamed Update',
		});
		assert.equal(edited.status, 200);
		assert.equal(edited.body.data.title, 'Renamed Update');
		assert.equal(edited.body.data.slug, 'creme-brulee-update');

		const published = await request(app).patch(`/api/v1/news/${id}`).set(auth).send({
			status: 'published',
		});
		assert.equal(published.status, 200);
		assert.ok(published.body.data.published_at);
		const publicArticle = await request(app).get(`/api/v1/news/${published.body.data.slug}`);
		assert.equal(publicArticle.status, 200);
		assert.equal(publicArticle.body.data.content, '## A safe Markdown article');
		assert.equal(Object.hasOwn(publicArticle.body.data, 'author_id'), false);

		const unpublished = await request(app).patch(`/api/v1/news/${id}`).set(auth).send({ status: 'draft' });
		assert.equal(unpublished.status, 200);
		assert.equal(unpublished.body.data.status, 'draft');
		assert.equal((await request(app).get(`/api/v1/news/${id}`)).status, 404);

		const adminList = await request(app).get('/api/v1/news/admin?status=draft&search=renamed').set(auth);
		assert.equal(adminList.status, 200);
		assert.ok(adminList.body.data.items.some((item) => item.id === id));

		const deleted = await request(app).delete(`/api/v1/news/${id}`).set(auth);
		assert.equal(deleted.status, 200);
		assert.deepEqual(deleted.body.data, { deleted: true });
	});

	it('rejects invalid and unknown input and enforces public pagination limits', async () => {
		const auth = { Authorization: `Bearer ${tokenFor(users.admin)}` };
		for (const body of [
			{ title: '' },
			{ title: 'Bad cover', cover_image_url: 'javascript:alert(1)' },
			{ title: 'Bad status', status: 'visible' },
			{ title: 'Unexpected author', author_id: users.mentee.id },
			{ title: 'HTML is rejected', content: '<script>alert(1)</script>' },
		]) {
			const response = await request(app).post('/api/v1/news').set(auth).send(body);
			assert.equal(response.status, 400);
			assert.equal(response.body.error.code, 'VALIDATION_ERROR');
			assert.ok(Array.isArray(response.body.error.details));
		}

		assert.equal((await request(app).get('/api/v1/news?limit=51')).status, 400);
		assert.equal((await request(app).get('/api/v1/news?other=value')).status, 400);
		assert.equal((await request(app).get('/api/v1/news/admin?status=visible').set(auth)).status, 400);
	});

	it('requires non-empty content before publishing', async () => {
		const auth = { Authorization: `Bearer ${tokenFor(users.admin)}` };
		const created = await request(app).post('/api/v1/news').set(auth).send({ title: 'No content yet' });
		assert.equal(created.status, 201);
		const published = await request(app).patch(`/api/v1/news/${created.body.data.id}`).set(auth).send({ status: 'published' });
		assert.equal(published.status, 400);
		assert.equal(published.body.error.code, 'VALIDATION_ERROR');
	});
});
