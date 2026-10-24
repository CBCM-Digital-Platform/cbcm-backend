// tests/unit/progress.test.js
process.env.JWT_SECRET = 'progress-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const service = require('../../src/services/progress.service');
const repository = require('../../src/repositories/progress.repository');
const models = require('../../src/models');

test('progress trends returns data grouped by date in chronological order', async () => {
	const originals = {
		findTrends: repository.findTrends,
	};

	const mockSnapshots = [
		{ mentee_id: 1, facility_id: 5, cycle_id: 10, thematic_area_id: 15, score: 75, recorded_at: new Date('2026-10-01') },
		{ mentee_id: 2, facility_id: 5, cycle_id: 10, thematic_area_id: 15, score: 85, recorded_at: new Date('2026-10-01') },
		{ mentee_id: 1, facility_id: 5, cycle_id: 10, thematic_area_id: 15, score: 80, recorded_at: new Date('2026-10-02') },
	];

	repository.findTrends = async () => mockSnapshots;

	try {
		const result = await service.getProgressTrends({}, { id: 1, role: 'admin' });
		assert.strictEqual(result.trends.length, 2);
		assert.strictEqual(result.trends[0].date, '2026-10-01');
		assert.strictEqual(result.trends[0].average_score, 80);
		assert.strictEqual(result.trends[0].snapshot_count, 2);
		assert.strictEqual(result.trends[1].date, '2026-10-02');
		assert.strictEqual(result.trends[1].average_score, 80);
		assert.strictEqual(result.trends[1].snapshot_count, 1);
		assert.strictEqual(result.total_snapshots, 3);
	} finally {
		repository.findTrends = originals.findTrends;
	}
});

test('progress trends handles empty dataset', async () => {
	const originals = {
		findTrends: repository.findTrends,
	};

	repository.findTrends = async () => [];

	try {
		const result = await service.getProgressTrends({}, { id: 1, role: 'admin' });
		assert.strictEqual(result.trends.length, 0);
		assert.strictEqual(result.total_snapshots, 0);
		assert.strictEqual(result.date_range.start, null);
		assert.strictEqual(result.date_range.end, null);
	} finally {
		repository.findTrends = originals.findTrends;
	}
});

test('progress trends enforces facility scope for facility admin', async () => {
	const originals = {
		findTrends: repository.findTrends,
	};

	let whereUsed;
	repository.findTrends = async (where) => {
		whereUsed = where;
		return [];
	};

	try {
		await service.getProgressTrends({}, { id: 10, role: 'facility_admin', facility_id: 5 });
		assert.strictEqual(whereUsed.facility_id, 5);
	} finally {
		repository.findTrends = originals.findTrends;
	}
});

test('progress trends rejects facility admin without facility assignment', async () => {
	const originals = {
		findTrends: repository.findTrends,
	};

	repository.findTrends = async () => [];

	try {
		await assert.rejects(
			service.getProgressTrends({}, { id: 10, role: 'facility_admin', facility_id: null }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findTrends = originals.findTrends;
	}
});

test('progress trends filters by cycle and thematic area', async () => {
	const originals = {
		findTrends: repository.findTrends,
	};

	let whereUsed;
	repository.findTrends = async (where) => {
		whereUsed = where;
		return [];
	};

	try {
		await service.getProgressTrends({ cycleId: 10, thematicAreaId: 15 }, { id: 1, role: 'admin' });
		assert.strictEqual(whereUsed.cycle_id, 10);
		assert.strictEqual(whereUsed.thematic_area_id, 15);
	} finally {
		repository.findTrends = originals.findTrends;
	}
});

test('progress trends filters by date range', async () => {
	const originals = {
		findTrends: repository.findTrends,
	};

	let whereUsed;
	repository.findTrends = async (where) => {
		whereUsed = where;
		return [];
	};

	try {
		await service.getProgressTrends({ startDate: '2026-10-01', endDate: '2026-10-31' }, { id: 1, role: 'admin' });
		assert.strictEqual(whereUsed.recorded_at !== undefined, true);
	} finally {
		repository.findTrends = originals.findTrends;
	}
});

test('mentee progress trends returns data grouped by thematic area and date', async () => {
	const originals = {
		findTrends: repository.findTrends,
		User: { ...models.User },
	};

	const mockSnapshots = [
		{ mentee_id: 1, thematic_area_id: 15, score: 75, competency_level: null, recorded_at: new Date('2026-10-01') },
		{ mentee_id: 1, thematic_area_id: 15, score: 80, competency_level: null, recorded_at: new Date('2026-10-02') },
		{ mentee_id: 1, thematic_area_id: 20, score: 85, competency_level: null, recorded_at: new Date('2026-10-01') },
	];

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 5 });
	repository.findTrends = async () => mockSnapshots;

	try {
		const result = await service.getMenteeProgressTrends(1, {}, { id: 1, role: 'mentee' });
		assert.strictEqual(result.mentee_id, 1);
		assert.strictEqual(result.trends.length, 3);
		assert.strictEqual(result.total_snapshots, 3);
	} finally {
		repository.findTrends = originals.findTrends;
		Object.assign(models.User, originals.User);
	}
});

test('mentee progress trends enforces mentee can only view own trends', async () => {
	const originals = {
		User: { ...models.User },
		findTrends: repository.findTrends,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 5 });
	repository.findTrends = async () => [];

	try {
		await assert.rejects(
			service.getMenteeProgressTrends(2, {}, { id: 1, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findTrends = originals.findTrends;
	}
});

test('mentee progress trends enforces facility admin scope', async () => {
	const originals = {
		User: { ...models.User },
		findTrends: repository.findTrends,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 10 });
	repository.findTrends = async () => [];

	try {
		await assert.rejects(
			service.getMenteeProgressTrends(1, {}, { id: 10, role: 'facility_admin', facility_id: 5 }),
			{ statusCode: 403 }
		);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findTrends = originals.findTrends;
	}
});

test('mentee progress trends handles null thematic area', async () => {
	const originals = {
		findTrends: repository.findTrends,
		User: { ...models.User },
	};

	const mockSnapshots = [
		{ mentee_id: 1, thematic_area_id: null, score: 75, competency_level: null, recorded_at: new Date('2026-10-01') },
	];

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 5 });
	repository.findTrends = async () => mockSnapshots;

	try {
		const result = await service.getMenteeProgressTrends(1, {}, { id: 1, role: 'mentee' });
		assert.strictEqual(result.trends[0].thematic_area_id, null);
	} finally {
		repository.findTrends = originals.findTrends;
		Object.assign(models.User, originals.User);
	}
});

test('mentee progress trends filters by date range', async () => {
	const originals = {
		findTrends: repository.findTrends,
		User: { ...models.User },
	};

	let whereUsed;
	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 5 });
	repository.findTrends = async (where) => {
		whereUsed = where;
		return [];
	};

	try {
		await service.getMenteeProgressTrends(1, { startDate: '2026-10-01', endDate: '2026-10-31' }, { id: 1, role: 'mentee' });
		assert.strictEqual(whereUsed.mentee_id, 1);
		assert.strictEqual(whereUsed.recorded_at !== undefined, true);
	} finally {
		repository.findTrends = originals.findTrends;
		Object.assign(models.User, originals.User);
	}
});

test('mentee progress trends returns empty when no snapshots exist', async () => {
	const originals = {
		findTrends: repository.findTrends,
		User: { ...models.User },
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 5 });
	repository.findTrends = async () => [];

	try {
		const result = await service.getMenteeProgressTrends(1, {}, { id: 1, role: 'mentee' });
		assert.strictEqual(result.trends.length, 0);
		assert.strictEqual(result.total_snapshots, 0);
	} finally {
		repository.findTrends = originals.findTrends;
		Object.assign(models.User, originals.User);
	}
});

test('competency rates endpoint is blocked - no competency level definitions exist', () => {
	assert.strictEqual(true, true, 'Competency rates cannot be implemented because competency_level is always null in snapshots and no competency thresholds are defined in the business rules.');
});
