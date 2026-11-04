process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const service = require('../../src/services/assessment-passing-rules.service');
const repository = require('../../src/repositories/assessment-passing-rules.repository');

test('list passing rules for system admin', async () => {
	const originals = {
		findMany: repository.findMany,
	};
	repository.findMany = async () => [
		{ id: 1, criteria_min_score: 70, theory_min_score: 80, practical_min_score: 3, is_active: true },
	];
	try {
		const result = await service.listPassingRules({}, { id: 1, role: 'admin' });
		assert.strictEqual(result.length, 1);
	} finally {
		repository.findMany = originals.findMany;
	}
});

test('facility admins can list only system-wide rules even when scoped filters are supplied', async () => {
	const originalFindMany = repository.findMany;
	let where;
	repository.findMany = async (filters) => {
		where = filters;
		return [];
	};
	try {
		await service.listPassingRules({ cycle_id: 8, thematic_area_id: 4, is_active: false }, {
			id: 10,
			role: 'facility_admin',
			facility_id: 2,
		});
		assert.equal(where.cycle_id, null);
		assert.equal(where.thematic_area_id, null);
		assert.equal(where.is_active, false);
	} finally {
		repository.findMany = originalFindMany;
	}
});

test('non-administrators cannot list passing rules through the service', async () => {
	await assert.rejects(
		service.listPassingRules({}, { id: 20, role: 'mentee' }),
		{ statusCode: 403, code: 'FORBIDDEN' }
	);
});

test('facility admins cannot retrieve scoped passing rules', async () => {
	const originalFindById = repository.findById;
	repository.findById = async (id) => ({ id, cycle_id: 2, thematic_area_id: null });
	try {
		await assert.rejects(
			service.getPassingRule(5, { id: 8, role: 'facility_admin', facility_id: 1 }),
			{ statusCode: 403, code: 'FORBIDDEN' }
		);
	} finally {
		repository.findById = originalFindById;
	}
});

test('create passing rule with valid thresholds', async () => {
	const originals = {
		create: repository.create,
		findById: repository.findById,
	};
	repository.create = async (data) => ({ id: 1, ...data });
	repository.findById = async (id) => ({ id, criteria_min_score: 75, theory_min_score: 85, practical_min_score: 4 });
	try {
		const result = await service.createPassingRule(
			{ criteria_min_score: 75, theory_min_score: 85, practical_min_score: 4 },
			{ id: 1, role: 'admin' }
		);
		assert.strictEqual(result.criteria_min_score, 75);
	} finally {
		repository.create = originals.create;
		repository.findById = originals.findById;
	}
});

test('reject invalid practical score threshold', async () => {
	await assert.rejects(
		service.createPassingRule({ practical_min_score: 6 }, { id: 1, role: 'admin' }),
		{ statusCode: 400 }
	);
});

test('reject theory score threshold > 100', async () => {
	await assert.rejects(
		service.createPassingRule({ theory_min_score: 101 }, { id: 1, role: 'admin' }),
		{ statusCode: 400 }
	);
});

test('facility admin cannot create scoped rules', async () => {
	await assert.rejects(
		service.createPassingRule({ cycle_id: 1 }, { id: 10, role: 'facility_admin' }),
		{ statusCode: 403 }
	);
});

test('only system admins can update or deactivate passing rules', async () => {
	const originalFindById = repository.findById;
	let reads = 0;
	repository.findById = async () => {
		reads += 1;
		return { id: 5, is_active: true };
	};
	try {
		await assert.rejects(
			service.updatePassingRule(5, { theory_min_score: 90 }, { id: 8, role: 'facility_admin' }),
			{ statusCode: 403, code: 'FORBIDDEN' }
		);
		await assert.rejects(
			service.deletePassingRule(5, { id: 8, role: 'facility_admin' }),
			{ statusCode: 403, code: 'FORBIDDEN' }
		);
		assert.equal(reads, 0);
	} finally {
		repository.findById = originalFindById;
	}
});

test('deleting a passing rule deactivates it and preserves the record', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};
	let updated;
	repository.findById = async (id) => ({ id, is_active: true });
	repository.update = async (id, data) => {
		updated = { id, ...data };
		return updated;
	};
	try {
		const result = await service.deletePassingRule(4, { id: 1, role: 'admin' });
		assert.deepEqual(updated, { id: 4, is_active: false, updated_by: 1 });
		assert.equal(result.deactivated, true);
		assert.equal(result.rule.id, 4);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});
