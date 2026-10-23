process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { createLocalStorageProvider } = require('../../src/providers/local-storage.provider');
const { createS3StorageProvider } = require('../../src/providers/s3-storage.provider');
const { getStorageProvider } = require('../../src/providers/storage.provider');

const readStream = async (stream) => {
	const chunks = [];
	for await (const chunk of stream) chunks.push(chunk);
	return Buffer.concat(chunks);
};

test('local storage stores, opens, and deletes files without exposing filesystem paths', async () => {
	const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'cbcm-storage-'));
	const provider = createLocalStorageProvider({ rootDirectory });
	const body = Buffer.from('resource-bytes');
	try {
		const stored = await provider.store({ body, mimeType: 'application/pdf' });
		assert.equal(provider.name, 'local');
		assert.match(stored.storageKey, /^[0-9a-f-]{36}\.pdf$/i);
		assert.equal(stored.sizeBytes, body.length);
		assert.equal(stored.storageKey.includes(path.sep), false);
		assert.equal(Object.prototype.hasOwnProperty.call(stored, 'path'), false);

		const opened = await provider.open(stored.storageKey);
		assert.equal(opened.sizeBytes, body.length);
		assert.deepEqual(await readStream(opened.stream), body);

		const removed = await provider.remove(stored.storageKey);
		assert.equal(removed.deleted, true);
		await assert.rejects(provider.open(stored.storageKey), { statusCode: 404, code: 'FILE_NOT_FOUND' });
	} finally {
		await fs.rm(rootDirectory, { recursive: true, force: true });
	}
});

test('local storage generates unique keys and refuses path traversal', async () => {
	const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'cbcm-storage-'));
	const provider = createLocalStorageProvider({ rootDirectory });
	try {
		const first = await provider.store({ body: Buffer.from('one'), mimeType: 'video/mp4' });
		const second = await provider.store({ body: Buffer.from('two'), mimeType: 'video/mp4' });
		assert.notEqual(first.storageKey, second.storageKey);

		await assert.rejects(provider.open('../secret.txt'), { statusCode: 400, code: 'INVALID_STORAGE_KEY' });
		await assert.rejects(provider.remove('..\\windows'), { statusCode: 400, code: 'INVALID_STORAGE_KEY' });
		await assert.rejects(provider.open(path.join(rootDirectory, first.storageKey)), { statusCode: 400, code: 'INVALID_STORAGE_KEY' });
	} finally {
		await fs.rm(rootDirectory, { recursive: true, force: true });
	}
});

test('storage factory uses local provider and fails closed for unsupported providers', () => {
	const provider = getStorageProvider({ provider: 'local', rootDirectory: os.tmpdir() });
	assert.equal(provider.name, 'local');
	assert.equal(typeof provider.store, 'function');
	assert.equal(typeof provider.open, 'function');
	assert.equal(typeof provider.remove, 'function');
	assert.throws(() => getStorageProvider({ provider: 's3', bucket: '' }), { code: 'STORAGE_NOT_CONFIGURED' });
	assert.throws(() => getStorageProvider({ provider: 'ftp' }), { code: 'STORAGE_NOT_CONFIGURED' });
});

const s3Config = {
	bucket: 'cbcm-test-bucket',
	region: 'us-east-1',
	accessKeyId: 'test-access-key',
	secretAccessKey: 'test-secret-key',
};

const createMockS3Client = () => {
	const objects = new Map();
	return {
		objects,
		send: async (command) => {
			if (command instanceof PutObjectCommand) {
				const key = command.input.Key;
				if (objects.has(key) && command.input.IfNoneMatch === '*') {
					const error = new Error('PreconditionFailed');
					error.name = 'PreconditionFailed';
					error.$metadata = { httpStatusCode: 412 };
					throw error;
				}
				const body = Buffer.from(command.input.Body);
				objects.set(key, { body, contentType: command.input.ContentType, size: body.length });
				return {};
			}
			if (command instanceof GetObjectCommand) {
				const stored = objects.get(command.input.Key);
				if (!stored) {
					const error = new Error('NoSuchKey');
					error.name = 'NoSuchKey';
					error.$metadata = { httpStatusCode: 404 };
					throw error;
				}
				return { Body: Readable.from(stored.body), ContentLength: stored.size };
			}
			if (command instanceof DeleteObjectCommand) {
				objects.delete(command.input.Key);
				return {};
			}
			throw new Error('Unsupported command');
		},
	};
};

test('s3 storage stores, opens, and deletes objects through the shared provider contract', async () => {
	const client = createMockS3Client();
	const provider = createS3StorageProvider({ ...s3Config, client });
	const body = Buffer.from('s3-resource-bytes');
	const stored = await provider.store({ body, mimeType: 'application/pdf' });
	assert.equal(provider.name, 's3');
	assert.match(stored.storageKey, /^[0-9a-f-]{36}\.pdf$/i);
	assert.equal(stored.sizeBytes, body.length);
	assert.equal(Object.prototype.hasOwnProperty.call(stored, 'url'), false);

	const opened = await provider.open(stored.storageKey);
	assert.equal(opened.sizeBytes, body.length);
	assert.deepEqual(await readStream(opened.stream), body);

	const removed = await provider.remove(stored.storageKey);
	assert.equal(removed.deleted, true);
	await assert.rejects(provider.open(stored.storageKey), { statusCode: 404, code: 'FILE_NOT_FOUND' });
});

test('s3 storage generates unique keys, rejects traversal, and requires configuration', async () => {
	const client = createMockS3Client();
	const provider = createS3StorageProvider({ ...s3Config, client, keyPrefix: 'cbcm/' });
	const first = await provider.store({ body: Buffer.from('one'), mimeType: 'audio/mpeg' });
	const second = await provider.store({ body: Buffer.from('two'), mimeType: 'audio/mpeg' });
	assert.notEqual(first.storageKey, second.storageKey);
	assert.equal([...client.objects.keys()].every((key) => key.startsWith('cbcm/')), true);

	await assert.rejects(provider.open('../secret.txt'), { statusCode: 400, code: 'INVALID_STORAGE_KEY' });
	await assert.rejects(provider.remove('/absolute/key'), { statusCode: 400, code: 'INVALID_STORAGE_KEY' });
	await assert.rejects(provider.open('missing-object-key'), { statusCode: 404, code: 'FILE_NOT_FOUND' });
	assert.throws(() => createS3StorageProvider({ bucket: '', region: 'us-east-1', accessKeyId: 'x', secretAccessKey: 'y' }), {
		code: 'STORAGE_NOT_CONFIGURED',
	});
});
