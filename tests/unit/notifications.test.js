process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'notifications-test-secret';

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const models = require('../../src/models');
const repository = require('../../src/repositories/notifications.repository');
const service = require('../../src/services/notifications.service');

const originals = [];
const replace = (object, key, value) => {
	originals.push([object, key, object[key]]);
	object[key] = value;
};

afterEach(() => {
	while (originals.length) {
		const [object, key, original] = originals.pop();
		object[key] = original;
	}
});

const request = async (path, options = {}) => {
	const server = app.listen(0);
	await new Promise((resolve) => server.once('listening', resolve));
	const address = server.address();
	try {
		return await fetch(`http://127.0.0.1:${address.port}/api/v1${path}`, options);
	} finally {
		server.closeAllConnections();
		await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
	}
};

const authHeaders = (userId = 7) => {
	const token = jwt.sign({
		sub: String(userId),
		token_use: 'access',
		password_version: 0,
	}, process.env.JWT_ACCESS_SECRET);
	return { authorization: `Bearer ${token}` };
};

test('notification routes reject unauthenticated requests', async () => {
	for (const path of ['/notifications', '/notifications/3/read', '/notifications/read-all', '/notifications/unread-count', '/notifications/3']) {
		const response = await request(path);
		assert.equal(response.status, 401);
	}
});

test('notification list is scoped to the authenticated user and returns the standard envelope', async () => {
	replace(models.User, 'findByPk', async (id) => ({
		id: Number(id),
		status: 'active',
		password_changed_at: null,
		must_change_password: false,
	}));
	let requestedUserId;
	const records = [{ id: 1, title: 'A notice', body: 'Details', is_read: false, created_at: new Date('2026-01-01T00:00:00Z') }];
	replace(repository, 'listNotificationsForUser', async (userId) => {
		requestedUserId = userId;
		return records;
	});

	const response = await request('/notifications', { headers: authHeaders(7) });
	assert.equal(response.status, 200);
	assert.equal(requestedUserId, 7);
	assert.deepEqual((await response.json()).data, [{
		id: 1,
		title: 'A notice',
		body: 'Details',
		isRead: false,
		createdAt: records[0].created_at.toISOString(),
	}]);
});

test('empty notification list returns a successful empty array', async () => {
	replace(models.User, 'findByPk', async (id) => ({
		id: Number(id),
		status: 'active',
		password_changed_at: null,
		must_change_password: false,
	}));
	replace(repository, 'listNotificationsForUser', async () => []);

	const response = await request('/notifications', { headers: authHeaders() });
	assert.deepEqual(await response.json(), { success: true, data: [] });
});

test('list repository restricts results to the owner and sorts newest first', async () => {
	let query;
	replace(models.Notification, 'findAll', async (options) => {
		query = options;
		return [];
	});
	await repository.listNotificationsForUser(19);
	assert.deepEqual(query.where, { user_id: 19 });
	assert.deepEqual(query.order, [['created_at', 'DESC'], ['id', 'DESC']]);
});

test('notification creation stores unread records for unique recipients', async () => {
	let created;
	replace(repository, 'createNotifications', async (notifications) => {
		created = notifications;
		return notifications;
	});

	const result = await service.createNotifications({
		userIds: [7, '8', 7],
		type: 'message_received',
		title: ' New message ',
		body: 'You received a new message.',
		referenceType: 'conversation',
		referenceId: 13,
	});

	assert.deepEqual(created.map(({ user_id, type, title, body, is_read, reference_type, reference_id }) => ({
		user_id,
		type,
		title,
		body,
		is_read,
		reference_type,
		reference_id,
	})), [
		{
			user_id: 7,
			type: 'message_received',
			title: 'New message',
			body: 'You received a new message.',
			is_read: false,
			reference_type: 'conversation',
			reference_id: 13,
		},
		{
			user_id: 8,
			type: 'message_received',
			title: 'New message',
			body: 'You received a new message.',
			is_read: false,
			reference_type: 'conversation',
			reference_id: 13,
		},
	]);
	assert.equal(result, created);
	assert.ok(created.every((notification) => notification.created_at instanceof Date));
});

test('notification creation rejects malformed recipients and payloads', async () => {
	await assert.rejects(
		service.createNotification({ userId: 0, type: 'event', title: 'Title' }),
		{ statusCode: 400, code: 'VALIDATION_ERROR' },
	);
	await assert.rejects(
		service.createNotification({ userId: 7, type: '', title: 'Title' }),
		{ statusCode: 400, code: 'VALIDATION_ERROR' },
	);
});

test('event publishing creates one isolated record per resolved recipient', async () => {
	let created;
	replace(models.User, 'findAll', async ({ where }) => {
		assert.ok(where.role);
		assert.ok(where[require('sequelize').Op.or]);
		return [{ id: 7 }, { id: 8 }, { id: 8 }];
	});
	replace(repository, 'createNotifications', async (notifications) => {
		created = notifications;
		return notifications;
	});

	await service.publishEvent({
		eventType: 'assignment.created',
		eventKey: 'assignment:12:created',
		referenceType: 'assignment',
		referenceId: 12,
		userIds: [3, 3],
		facilityIds: [4],
	});

	assert.deepEqual(created.map((notification) => notification.user_id), [3, 7, 8]);
	assert.ok(created.every((notification) => notification.event_key === 'assignment:12:created'));
});

test('event publishing never resolves facility-scoped roles globally', async () => {
	let userLookupCount = 0;
	replace(models.User, 'findAll', async () => {
		userLookupCount += 1;
		return [{ id: 99 }];
	});
	replace(repository, 'createNotifications', async (notifications) => notifications);

	const created = await service.publishEvent({
		eventType: 'learning.module_access_granted',
		eventKey: 'learning-module:12:mentor:3:access-granted',
		userIds: [3],
		roles: ['facility_admin'],
	});

	assert.equal(userLookupCount, 0);
	assert.deepEqual(created.map((notification) => notification.user_id), [3]);
});

test('mark-read routes use authenticated ownership and repeated marks are safe', async () => {
	replace(models.User, 'findByPk', async (id) => ({
		id: Number(id),
		status: 'active',
		password_changed_at: null,
		must_change_password: false,
	}));
	const requested = [];
	const record = { id: 13, user_id: 7, is_read: true };
	replace(repository, 'markNotificationRead', async (input) => {
		requested.push(input);
		return record;
	});

	const first = await request('/notifications/13/read', { method: 'PATCH', headers: authHeaders(7) });
	const second = await request('/notifications/13/read', { method: 'PATCH', headers: authHeaders(7) });
	assert.equal(first.status, 200);
	assert.equal(second.status, 200);
	assert.deepEqual(requested, [
		{ notificationId: 13, userId: 7 },
		{ notificationId: 13, userId: 7 },
	]);
	assert.equal((await second.json()).data.isRead, true);
});

test('mark-read repository scopes update and lookup to the owner', async () => {
	const calls = [];
	replace(models.Notification, 'update', async (values, options) => {
		calls.push({ kind: 'update', values, where: options.where });
		return [1];
	});
	replace(models.Notification, 'findOne', async (options) => {
		calls.push({ kind: 'findOne', where: options.where });
		return { id: 13, user_id: 7, is_read: true };
	});
	assert.deepEqual(await repository.markNotificationRead({ notificationId: 13, userId: 7 }), {
		id: 13,
		user_id: 7,
		is_read: true,
	});
	assert.deepEqual(calls, [
		{ kind: 'update', values: { is_read: true }, where: { id: 13, user_id: 7 } },
		{ kind: 'findOne', where: { id: 13, user_id: 7 } },
	]);
});

test('marking a notification owned by another user returns not found', async () => {
	replace(repository, 'markNotificationRead', async () => null);
	await assert.rejects(
		service.markRead({ notificationId: 13, userId: 7 }),
		{ statusCode: 404, code: 'NOT_FOUND' },
	);
});

test('mark-all runs before parameterized routes and updates only the authenticated user unread notifications', async () => {
	replace(models.User, 'findByPk', async (id) => ({
		id: Number(id),
		status: 'active',
		password_changed_at: null,
		must_change_password: false,
	}));
	let requestedUserId;
	replace(repository, 'markAllNotificationsRead', async (userId) => {
		requestedUserId = userId;
		return 2;
	});

	const response = await request('/notifications/read-all', { method: 'PATCH', headers: authHeaders(7) });
	assert.equal(response.status, 200);
	assert.equal(requestedUserId, 7);
	assert.deepEqual((await response.json()).data, { updatedCount: 2 });
});

test('mark-all repository only updates unread notifications of the authenticated user', async () => {
	let query;
	replace(models.Notification, 'update', async (values, options) => {
		query = { values, where: options.where };
		return [3];
	});
	assert.equal(await repository.markAllNotificationsRead(22), 3);
	assert.deepEqual(query, {
		values: { is_read: true },
		where: { user_id: 22, is_read: false },
	});
});

test('unread count is queried from unread notifications owned by the user', async () => {
	let query;
	replace(models.Notification, 'count', async (options) => {
		query = options;
		return 4;
	});
	assert.equal(await repository.countUnreadNotifications(18), 4);
	assert.deepEqual(query.where, { user_id: 18, is_read: false });
});

test('unread count reflects read changes without affecting another user', async () => {
	const notifications = [
		{ id: 1, user_id: 7, is_read: false },
		{ id: 2, user_id: 7, is_read: false },
		{ id: 3, user_id: 8, is_read: false },
	];
	const matches = (notification, where) => Object.entries(where).every(([key, value]) => notification[key] === value);
	replace(models.Notification, 'update', async (values, options) => {
		const matchesToUpdate = notifications.filter((notification) => matches(notification, options.where));
		matchesToUpdate.forEach((notification) => Object.assign(notification, values));
		return [matchesToUpdate.length];
	});
	replace(models.Notification, 'findOne', async (options) => (
		notifications.find((notification) => matches(notification, options.where)) || null
	));
	replace(models.Notification, 'count', async (options) => (
		notifications.filter((notification) => matches(notification, options.where)).length
	));

	await repository.markNotificationRead({ notificationId: 1, userId: 7 });
	assert.equal(await repository.countUnreadNotifications(7), 1);
	assert.equal(await repository.markAllNotificationsRead(7), 1);
	assert.equal(await repository.countUnreadNotifications(7), 0);
	assert.equal(await repository.countUnreadNotifications(8), 1);
});

test('unread-count endpoint returns the database count for the authenticated user', async () => {
	replace(models.User, 'findByPk', async (id) => ({
		id: Number(id),
		status: 'active',
		password_changed_at: null,
		must_change_password: false,
	}));
	let requestedUserId;
	replace(repository, 'countUnreadNotifications', async (userId) => {
		requestedUserId = userId;
		return 4;
	});

	const response = await request('/notifications/unread-count', { headers: authHeaders(12) });
	assert.equal(response.status, 200);
	assert.equal(requestedUserId, 12);
	assert.deepEqual((await response.json()).data, { unreadCount: 4 });
});

test('delete route is scoped to the authenticated owner and responds on success', async () => {
	replace(models.User, 'findByPk', async (id) => ({
		id: Number(id),
		status: 'active',
		password_changed_at: null,
		must_change_password: false,
	}));
	let requested;
	replace(repository, 'deleteNotification', async (input) => {
		requested = input;
		return true;
	});

	const response = await request('/notifications/13', { method: 'DELETE', headers: authHeaders(9) });
	assert.equal(response.status, 200);
	assert.deepEqual(requested, { notificationId: 13, userId: 9 });
	assert.deepEqual((await response.json()).data, { deleted: true });
});

test('notification deletion query is owner-scoped and missing or foreign records return not found', async () => {
	let query;
	replace(models.Notification, 'destroy', async (options) => {
		query = options;
		return 0;
	});
	assert.equal(await repository.deleteNotification({ notificationId: 13, userId: 9 }), false);
	assert.deepEqual(query.where, { id: 13, user_id: 9 });
	await assert.rejects(
		service.deleteNotification({ notificationId: 13, userId: 9 }),
		{ statusCode: 404, code: 'NOT_FOUND' },
	);
});

test('notification IDs must be positive integers', async () => {
	replace(models.User, 'findByPk', async (id) => ({
		id: Number(id),
		status: 'active',
		password_changed_at: null,
		must_change_password: false,
	}));
	const response = await request('/notifications/not-an-id/read', {
		method: 'PATCH',
		headers: authHeaders(),
	});
	assert.equal(response.status, 400);
});
