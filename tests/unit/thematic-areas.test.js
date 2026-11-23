// tests/unit/thematic-areas.test.js
process.env.JWT_SECRET = 'thematic-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const service = require('../../src/services/thematic-areas.service');
const repository = require('../../src/repositories/thematic-areas.repository');
const models = require('../../src/models');

const repoKeys = ['findAndCountAll', 'findById', 'findByCode', 'findByNormalizedName', 'create', 'update', 'destroy', 'count'];
const originals = Object.fromEntries(repoKeys.map((key) => [key, repository[key]]));
const originalTransaction = models.sequelize.transaction;

function restore() {
	for (const key of repoKeys) repository[key] = originals[key];
	models.sequelize.transaction = originalTransaction;
}

function stubTransaction() {
	models.sequelize.transaction = async (callback) => callback({ transaction: true });
}

test('create thematic area succeeds when name is unique', async (t) => {
	t.after(restore);
	stubTransaction();
	let normalizedLookup;
	repository.findByCode = async () => null;
	repository.findByNormalizedName = async (name, options) => {
		normalizedLookup = { name, options };
		return null;
	};
	repository.create = async (values) => ({ id: 9, ...values });

	const result = await service.createThematicArea({ code: 'MNH', name: '  Maternal Health  ' }, 1);
	assert.equal(result.id, 9);
	assert.equal(result.name, 'Maternal Health');
	assert.equal(normalizedLookup.name, 'Maternal Health');
	assert.equal(normalizedLookup.options, undefined);
});

test('create thematic area rejects duplicate name regardless of casing', async (t) => {
	t.after(restore);
	stubTransaction();
	repository.findByCode = async () => null;
	repository.findByNormalizedName = async () => ({ id: 3, name: 'maternal health' });
	repository.create = async () => {
		throw new Error('create should not be reached');
	};

	await assert.rejects(
		service.createThematicArea({ code: 'NEW', name: 'MATERNAL HEALTH' }, 1),
		(error) => error.statusCode === 409 && error.code === 'THEMATIC_AREA_NAME_EXISTS'
	);
});

test('create thematic area still rejects duplicate code', async (t) => {
	t.after(restore);
	stubTransaction();
	repository.findByCode = async () => ({ id: 1, code: 'MNH' });
	repository.findByNormalizedName = async () => null;

	await assert.rejects(
		service.createThematicArea({ code: 'MNH', name: 'Unique Name' }, 1),
		(error) => error.statusCode === 409 && error.code === 'THEMATIC_AREA_EXISTS'
	);
});

test('update thematic area without name change succeeds', async (t) => {
	t.after(restore);
	stubTransaction();
	repository.findById = async () => ({ id: 5, code: 'OLD', name: 'Old Name' });
	repository.findByCode = async () => null;
	repository.findByNormalizedName = async () => {
		throw new Error('name lookup should not run when name is unchanged');
	};
	repository.update = async (id, values) => ({ id, code: 'NEW', name: 'Old Name' });

	const result = await service.updateThematicArea(5, { code: 'NEW' }, 1);
	assert.equal(result.code, 'NEW');
	assert.equal(result.name, 'Old Name');
});

test('update thematic area to its own name in different casing succeeds', async (t) => {
	t.after(restore);
	stubTransaction();
	repository.findById = async () => ({ id: 5, code: 'MNH', name: 'Maternal Health' });
	// Repository excludes the current record, so only other records are returned.
	repository.findByNormalizedName = async (name, options) => {
		assert.equal(options.excludeId, 5);
		return null;
	};
	repository.update = async (id, values) => ({ id, ...values });

	const result = await service.updateThematicArea(5, { name: '  maternal health  ' }, 1);
	assert.equal(result.name, 'maternal health');
});

test('update thematic area rejects renaming to an existing name', async (t) => {
	t.after(restore);
	stubTransaction();
	repository.findById = async () => ({ id: 5, code: 'MNH', name: 'Old Name' });
	repository.findByNormalizedName = async () => ({ id: 2, name: 'Taken Name' });
	repository.update = async () => {
		throw new Error('update should not be reached');
	};

	await assert.rejects(
		service.updateThematicArea(5, { name: 'taken name' }, 1),
		(error) => error.statusCode === 409 && error.code === 'THEMATIC_AREA_NAME_EXISTS'
	);
});

test('update thematic area succeeds when renaming to a unique name', async (t) => {
	t.after(restore);
	stubTransaction();
	repository.findById = async () => ({ id: 5, code: 'MNH', name: 'Old Name' });
	repository.findByNormalizedName = async () => null;
	repository.update = async (id, values) => ({ id, ...values });

	const result = await service.updateThematicArea(5, { name: 'Brand New Area' }, 1);
	assert.equal(result.name, 'Brand New Area');
});

test('database unique violation maps to a 409 conflict', async (t) => {
	t.after(restore);
	stubTransaction();
	repository.findByCode = async () => null;
	repository.findByNormalizedName = async () => null;
	repository.create = async () => {
		const error = new Error('duplicate key value');
		error.name = 'SequelizeUniqueConstraintError';
		throw error;
	};

	await assert.rejects(
		service.createThematicArea({ code: 'RACE', name: 'Race Name' }, 1),
		(error) => error.statusCode === 409 && error.code === 'THEMATIC_AREA_EXISTS'
	);
});
