// tests/unit/activity-logs.test.js
process.env.JWT_SECRET = 'activity-logs-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const service = require('../../src/services/activity-logs.service');
const repository = require('../../src/repositories/activity-logs.repository');
const models = require('../../src/models');

test('activity logs list returns paginated results', async () => {
	const originals = {
		findMany: repository.findMany,
		count: repository.count,
	};

	const mockLogs = [
		{ id: 1, actor_id: 10, facility_id: 5, action: 'login', entity_type: 'user', entity_id: 10, details: '{"outcome":"success"}', ip_address: '192.168.1.1', user_agent: 'Mozilla', created_at: new Date('2026-10-15') },
		{ id: 2, actor_id: 10, facility_id: 5, action: 'logout', entity_type: 'user', entity_id: 10, details: '{"outcome":"success"}', ip_address: '192.168.1.1', user_agent: 'Mozilla', created_at: new Date('2026-10-14') },
	];

	repository.findMany = async () => ({ count: 2, rows: mockLogs });

	try {
		const result = await service.listActivityLogs({ page: 1, limit: 20 }, { id: 1, role: 'admin' });
		assert.strictEqual(result.items.length, 2);
		assert.strictEqual(result.total, 2);
		assert.strictEqual(result.page, 1);
		assert.strictEqual(result.limit, 20);
		assert.strictEqual(result.totalPages, 1);
	} finally {
		repository.findMany = originals.findMany;
	}
});

test('activity logs enforces facility scope for facility admin', async () => {
	const originals = {
		findMany: repository.findMany,
	};

	let whereUsed;
	repository.findMany = async (where) => {
		whereUsed = where;
		return { count: 0, rows: [] };
	};

	try {
		await service.listActivityLogs({}, { id: 10, role: 'facility_admin', facility_id: 5 });
		assert.strictEqual(whereUsed.facility_id, 5);
	} finally {
		repository.findMany = originals.findMany;
	}
});

test('activity logs rejects facility admin without facility assignment', async () => {
	const originals = {
		findMany: repository.findMany,
	};

	repository.findMany = async () => ({ count: 0, rows: [] });

	try {
		await assert.rejects(
			service.listActivityLogs({}, { id: 10, role: 'facility_admin', facility_id: null }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findMany = originals.findMany;
	}
});

test('activity logs restricts mentors to their own logs', async () => {
	const originals = {
		findMany: repository.findMany,
	};

	let whereUsed;
	repository.findMany = async (where) => {
		whereUsed = where;
		return { count: 0, rows: [] };
	};

	try {
		await service.listActivityLogs({}, { id: 15, role: 'mentor' });
		assert.strictEqual(whereUsed.actor_id, 15);
	} finally {
		repository.findMany = originals.findMany;
	}
});

test('activity logs restricts mentees to their own logs', async () => {
	const originals = {
		findMany: repository.findMany,
	};

	let whereUsed;
	repository.findMany = async (where) => {
		whereUsed = where;
		return { count: 0, rows: [] };
	};

	try {
		await service.listActivityLogs({}, { id: 20, role: 'mentee' });
		assert.strictEqual(whereUsed.actor_id, 20);
	} finally {
		repository.findMany = originals.findMany;
	}
});

test('activity logs filters by action and entity type', async () => {
	const originals = {
		findMany: repository.findMany,
	};

	let whereUsed;
	repository.findMany = async (where) => {
		whereUsed = where;
		return { count: 0, rows: [] };
	};

	try {
		await service.listActivityLogs({ action: 'assessment.finalized', entityType: 'assessment' }, { id: 1, role: 'admin' });
		assert.strictEqual(whereUsed.action, 'assessment.finalized');
		assert.strictEqual(whereUsed.entity_type, 'assessment');
	} finally {
		repository.findMany = originals.findMany;
	}
});

test('activity logs filters by date range', async () => {
	const originals = {
		findMany: repository.findMany,
	};

	let whereUsed;
	repository.findMany = async (where) => {
		whereUsed = where;
		return { count: 0, rows: [] };
	};

	try {
		await service.listActivityLogs({ startDate: '2026-10-01', endDate: '2026-10-31' }, { id: 1, role: 'admin' });
		assert.strictEqual(whereUsed.created_at !== undefined, true);
	} finally {
		repository.findMany = originals.findMany;
	}
});

test('activity logs get by id enforces facility scope', async () => {
	const originals = {
		findById: repository.findById,
	};

	const mockLog = { id: 1, actor_id: 10, facility_id: 5, action: 'login', entity_type: 'user', entity_id: 10, details: '{"outcome":"success"}', ip_address: '192.168.1.1', user_agent: 'Mozilla', created_at: new Date('2026-10-15') };
	repository.findById = async (id) => mockLog;

	try {
		await assert.rejects(
			service.getActivityLogById(1, { id: 10, role: 'facility_admin', facility_id: 10 }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
	}
});

test('activity logs get by id restricts mentors to their own logs', async () => {
	const originals = {
		findById: repository.findById,
	};

	const mockLog = { id: 1, actor_id: 10, facility_id: 5, action: 'login', entity_type: 'user', entity_id: 10, details: '{"outcome":"success"}', ip_address: '192.168.1.1', user_agent: 'Mozilla', created_at: new Date('2026-10-15') };
	repository.findById = async (id) => mockLog;

	try {
		await assert.rejects(
			service.getActivityLogById(1, { id: 15, role: 'mentor' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
	}
});

test('activity logs get by id restricts mentees to their own logs', async () => {
	const originals = {
		findById: repository.findById,
	};

	const mockLog = { id: 1, actor_id: 10, facility_id: 5, action: 'login', entity_type: 'user', entity_id: 10, details: '{"outcome":"success"}', ip_address: '192.168.1.1', user_agent: 'Mozilla', created_at: new Date('2026-10-15') };
	repository.findById = async (id) => mockLog;

	try {
		await assert.rejects(
			service.getActivityLogById(1, { id: 20, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
	}
});

test('activity logs get by id returns not found for invalid id', async () => {
	const originals = {
		findById: repository.findById,
	};

	repository.findById = async (id) => null;

	try {
		await assert.rejects(
			service.getActivityLogById(999, { id: 1, role: 'admin' }),
			{ statusCode: 404 }
		);
	} finally {
		repository.findById = originals.findById;
	}
});

test('activity logs handles empty dataset', async () => {
	const originals = {
		findMany: repository.findMany,
	};

	repository.findMany = async () => ({ count: 0, rows: [] });

	try {
		const result = await service.listActivityLogs({}, { id: 1, role: 'admin' });
		assert.strictEqual(result.items.length, 0);
		assert.strictEqual(result.total, 0);
	} finally {
		repository.findMany = originals.findMany;
	}
});
