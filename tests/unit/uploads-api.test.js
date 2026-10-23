process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Readable } = require('node:stream');
const storage = require('../../src/providers/storage.provider');
const repository = require('../../src/repositories/uploads.repository');
const service = require('../../src/services/uploads.service');
const { parseId, parseContext } = require('../../src/validators/uploads.validator');

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

test('upload service stores metadata after the storage provider succeeds and rolls back on database failure', async () => {
	const originals = {
		getStorageProvider: storage.getStorageProvider,
		create: repository.create,
		findById: repository.findById,
		destroy: repository.destroy,
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
		repository.destroy = async () => true;
		const removed = await service.deleteUpload(12, { id: 7, role: 'facility_admin' });
		assert.equal(removed.deleted, true);

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
