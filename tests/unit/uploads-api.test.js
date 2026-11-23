process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Readable } = require('node:stream');
const storage = require('../../src/providers/storage.provider');
const repository = require('../../src/repositories/uploads.repository');
const service = require('../../src/services/uploads.service');
const { parseId, parseContext } = require('../../src/validators/uploads.validator');
const models = require('../../src/models');

test('upload routes are registered for create, metadata, download, and delete', () => {
	const router = require('../../src/routes/uploads.routes');
	const registered = router.stack
		.filter((layer) => layer.route)
		.flatMap((layer) => Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${layer.route.path}`));
	assert.ok(registered.includes('POST /'));
	assert.ok(registered.includes('GET /:id'));
	assert.ok(registered.includes('GET /:id/content'));
	assert.ok(registered.includes('DELETE /:id'));
});

test('upload validators accept context and reject invalid ids', () => {
	assert.equal(parseContext(undefined), 'resource');
	assert.equal(parseContext('learning-resource'), 'learning-resource');
	assert.throws(() => parseContext('bad context'), { statusCode: 400 });
	assert.equal(parseId('9', 'id'), 9);
	assert.throws(() => parseId('nope', 'id'), { statusCode: 400 });
});

test('upload reference count protects Resource and classified LearningModuleContent files', async () => {
	const originals = {
		resourceCount: models.Resource.count,
		contentCount: models.LearningModuleContent.count,
	};
	const calls = [];
	models.Resource.count = async (options) => {
		calls.push({ model: 'Resource', options });
		return 1;
	};
	models.LearningModuleContent.count = async (options) => {
		calls.push({ model: 'LearningModuleContent', options });
		return 2;
	};
	try {
		assert.equal(await repository.countClassifiedLearningMaterialReferences(45), 3);
		assert.deepEqual(calls.map((entry) => entry.model), ['LearningModuleContent', 'Resource']);
		assert.deepEqual(calls.find((entry) => entry.model === 'Resource').options.where, { file_id: 45 });
		assert.equal(calls.find((entry) => entry.model === 'LearningModuleContent').options.where.file_id, 45);
	} finally {
		models.Resource.count = originals.resourceCount;
		models.LearningModuleContent.count = originals.contentCount;
	}
});

test('upload deletion refuses Resource references and still deletes unreferenced uploads', async () => {
	const originals = {
		getStorageProvider: storage.getStorageProvider,
		findById: repository.findById,
		destroy: repository.destroy,
		resourceCount: models.Resource.count,
		contentCount: models.LearningModuleContent.count,
	};
	const removed = [];
	let resourceReferences = 1;
	storage.getStorageProvider = () => ({
		remove: async (key) => removed.push(key),
	});
	repository.findById = async () => ({
		id: 51,
		owner_id: 7,
		storage_key: 'resource-file.pptx',
	});
	repository.destroy = async () => true;
	models.Resource.count = async () => resourceReferences;
	models.LearningModuleContent.count = async () => 0;
	try {
		await assert.rejects(service.deleteUpload(51, { id: 7, role: 'facility_admin' }), {
			statusCode: 409,
			code: 'CONFLICT',
		});
		assert.deepEqual(removed, []);
		resourceReferences = 0;
		assert.deepEqual(await service.deleteUpload(51, { id: 7, role: 'facility_admin' }), {
			id: 51,
			deleted: true,
		});
		assert.deepEqual(removed, ['resource-file.pptx']);
	} finally {
		storage.getStorageProvider = originals.getStorageProvider;
		repository.findById = originals.findById;
		repository.destroy = originals.destroy;
		models.Resource.count = originals.resourceCount;
		models.LearningModuleContent.count = originals.contentCount;
	}
});

test('upload service stores metadata after the storage provider succeeds and rolls back on database failure', async () => {
	const originals = {
		getStorageProvider: storage.getStorageProvider,
		create: repository.create,
		findById: repository.findById,
		destroy: repository.destroy,
		countClassifiedLearningMaterialReferences: repository.countClassifiedLearningMaterialReferences,
	};
	const stored = [];
	storage.getStorageProvider = () => ({
		name: 'local',
		store: async ({ body, mimeType }) => {
			stored.push({ body, mimeType });
			return { storageKey: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf', sizeBytes: body.length, mimeType };
		},
		open: async () => ({ storageKey: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf', sizeBytes: 4, stream: Readable.from(Buffer.from('data')) }),
		remove: async (storageKey) => {
			stored.push({ removed: storageKey });
			return { storageKey, deleted: true };
		},
	});
	repository.create = async (data) => ({ id: 12, ...data, created_at: new Date('2026-10-23T00:00:00.000Z') });
	try {
		const created = await service.createUpload({
			actor: { id: 7, role: 'facility_admin' },
			upload: { body: Buffer.from('%PDF'), mimeType: 'application/pdf' },
			context: 'resource',
		});
		assert.equal(created.id, 12);
		assert.equal(created.ownerId, 7);
		assert.equal(created.mimeType, 'application/pdf');
		assert.equal(Object.prototype.hasOwnProperty.call(created, 'storageKey'), false);

		repository.findById = async () => null;
		await assert.rejects(service.getUpload(99, { id: 7, role: 'facility_admin' }), { statusCode: 404 });

		repository.findById = async () => ({ id: 12, owner_id: 7, storage_key: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pdf', mime_type: 'application/pdf', size_bytes: 4 });
		repository.countClassifiedLearningMaterialReferences = async () => 0;
		repository.destroy = async () => true;
		const removed = await service.deleteUpload(12, { id: 7, role: 'facility_admin' });
		assert.equal(removed.deleted, true);
		repository.countClassifiedLearningMaterialReferences = async () => 1;
		await assert.rejects(service.deleteUpload(12, { id: 7, role: 'facility_admin' }), { statusCode: 409, code: 'CONFLICT' });

		repository.create = async () => {
			throw new Error('db-down');
		};
		await assert.rejects(
			service.createUpload({
				actor: { id: 7, role: 'facility_admin' },
				upload: { body: Buffer.from('%PDF'), mimeType: 'application/pdf' },
			}),
			{ message: 'db-down' }
		);
		assert.equal(stored.some((entry) => entry.removed), true);
	} finally {
		Object.assign(storage, { getStorageProvider: originals.getStorageProvider });
		Object.assign(repository, originals);
	}
});
