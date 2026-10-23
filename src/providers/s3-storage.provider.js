const { Readable } = require('node:stream');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const AppError = require('../errors/app-error');
const env = require('../config/env');
const { createStorageKey } = require('./local-storage.provider');

function storageFailure(error, fallbackMessage) {
	if (error instanceof AppError) return error;
	return new AppError(fallbackMessage, 500, 'STORAGE_ERROR');
}

function isMissingObject(error) {
	const status = error?.$metadata?.httpStatusCode;
	const name = String(error?.name || error?.Code || '');
	return status === 404 || name === 'NoSuchKey' || name === 'NotFound';
}

function isPreconditionFailed(error) {
	return error?.$metadata?.httpStatusCode === 412 || String(error?.name || '') === 'PreconditionFailed';
}

function assertStorageKey(storageKey) {
	if (typeof storageKey !== 'string' || !storageKey.trim()) {
		throw new AppError('A valid storage key is required.', 400, 'VALIDATION_ERROR');
	}
	const key = storageKey.trim();
	if (
		key.includes('\0')
		|| key.includes('..')
		|| key.includes('\\')
		|| key.startsWith('/')
		|| key.includes('//')
	) {
		throw new AppError('The storage key is invalid.', 400, 'INVALID_STORAGE_KEY');
	}
	return key;
}

function requireS3Config(options = {}) {
	const bucket = options.bucket ?? env.S3_BUCKET;
	const region = options.region ?? env.S3_REGION;
	const accessKeyId = options.accessKeyId ?? env.AWS_ACCESS_KEY_ID;
	const secretAccessKey = options.secretAccessKey ?? env.AWS_SECRET_ACCESS_KEY;
	const keyPrefix = options.keyPrefix ?? env.S3_KEY_PREFIX ?? '';
	if (!bucket || !region || !accessKeyId || !secretAccessKey) {
		throw new AppError('S3 storage is not configured.', 500, 'STORAGE_NOT_CONFIGURED');
	}
	return { bucket, region, accessKeyId, secretAccessKey, keyPrefix };
}

function objectKey(keyPrefix, storageKey) {
	if (!keyPrefix) return storageKey;
	return `${keyPrefix.replace(/^\/+|\/+$/g, '')}/${storageKey}`;
}

function toStream(body) {
	if (!body) return Readable.from([]);
	if (typeof body.pipe === 'function') return body;
	if (typeof body.transformToWebStream === 'function') {
		return Readable.fromWeb(body.transformToWebStream());
	}
	return Readable.from(body);
}

function createS3StorageProvider(options = {}) {
	const { bucket, region, accessKeyId, secretAccessKey, keyPrefix } = requireS3Config(options);
	const client = options.client || new S3Client({
		region,
		credentials: { accessKeyId, secretAccessKey },
	});

	async function store({ body, mimeType } = {}) {
		if (!Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
			throw new AppError('File contents are required.', 400, 'VALIDATION_ERROR');
		}
		const buffer = Buffer.from(body);
		if (!buffer.length) {
			throw new AppError('File contents are required.', 400, 'VALIDATION_ERROR');
		}
		if (buffer.length > env.UPLOAD_MAX_BYTES) {
			throw new AppError('The uploaded file exceeds the maximum allowed size.', 400, 'FILE_TOO_LARGE');
		}

		for (let attempt = 0; attempt < 8; attempt += 1) {
			const storageKey = createStorageKey(mimeType);
			try {
				await client.send(new PutObjectCommand({
					Bucket: bucket,
					Key: objectKey(keyPrefix, storageKey),
					Body: buffer,
					ContentType: mimeType || undefined,
					ContentLength: buffer.length,
					IfNoneMatch: '*',
				}));
				return { storageKey, sizeBytes: buffer.length, mimeType: mimeType || null };
			} catch (error) {
				if (isPreconditionFailed(error)) continue;
				throw storageFailure(error, 'Unable to store the uploaded file.');
			}
		}
		throw new AppError('Unable to store the uploaded file.', 500, 'STORAGE_ERROR');
	}

	async function open(storageKey) {
		const key = assertStorageKey(storageKey);
		try {
			const result = await client.send(new GetObjectCommand({
				Bucket: bucket,
				Key: objectKey(keyPrefix, key),
			}));
			return {
				storageKey: key,
				sizeBytes: Number(result.ContentLength || 0),
				stream: toStream(result.Body),
			};
		} catch (error) {
			if (error instanceof AppError) throw error;
			if (isMissingObject(error)) {
				throw new AppError('The requested file was not found.', 404, 'FILE_NOT_FOUND');
			}
			throw storageFailure(error, 'Unable to read the stored file.');
		}
	}

	async function remove(storageKey) {
		const key = assertStorageKey(storageKey);
		try {
			await open(key);
			await client.send(new DeleteObjectCommand({
				Bucket: bucket,
				Key: objectKey(keyPrefix, key),
			}));
			return { storageKey: key, deleted: true };
		} catch (error) {
			if (error instanceof AppError) throw error;
			if (isMissingObject(error)) {
				throw new AppError('The requested file was not found.', 404, 'FILE_NOT_FOUND');
			}
			throw storageFailure(error, 'Unable to delete the stored file.');
		}
	}

	return {
		name: 's3',
		store,
		open,
		remove,
	};
}

module.exports = {
	createS3StorageProvider,
};
