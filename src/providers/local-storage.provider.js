const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AppError = require('../errors/app-error');
const env = require('../config/env');

const MIME_EXTENSIONS = Object.freeze({
	'application/pdf': '.pdf',
	'audio/mpeg': '.mp3',
	'audio/mp3': '.mp3',
	'audio/mp4': '.m4a',
	'audio/wav': '.wav',
	'audio/x-wav': '.wav',
	'audio/webm': '.weba',
	'video/mp4': '.mp4',
	'video/webm': '.webm',
	'video/quicktime': '.mov',
});

function extensionFor(mimeType) {
	const normalized = String(mimeType || '').trim().toLowerCase();
	return MIME_EXTENSIONS[normalized] || '';
}

function createStorageKey(mimeType) {
	return `${crypto.randomUUID()}${extensionFor(mimeType)}`;
}

function storageFailure(error, fallbackMessage) {
	if (error instanceof AppError) return error;
	return new AppError(fallbackMessage, 500, 'STORAGE_ERROR');
}

function createLocalStorageProvider({ rootDirectory } = {}) {
	const root = path.resolve(rootDirectory || env.LOCAL_STORAGE_DIR);

	function resolveStoredPath(storageKey) {
		if (typeof storageKey !== 'string' || !storageKey.trim()) {
			throw new AppError('A valid storage key is required.', 400, 'VALIDATION_ERROR');
		}
		const key = storageKey.trim();
		if (key.includes('\0') || path.isAbsolute(key) || key.includes('..') || path.normalize(key) !== key) {
			throw new AppError('The storage key is invalid.', 400, 'INVALID_STORAGE_KEY');
		}
		const destination = path.resolve(root, key);
		const boundedRoot = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
		if (destination !== root && !destination.startsWith(boundedRoot)) {
			throw new AppError('The storage key is invalid.', 400, 'INVALID_STORAGE_KEY');
		}
		return destination;
	}

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

		await fs.mkdir(root, { recursive: true });
		for (let attempt = 0; attempt < 8; attempt += 1) {
			const storageKey = createStorageKey(mimeType);
			const destination = resolveStoredPath(storageKey);
			try {
				await fs.writeFile(destination, buffer, { flag: 'wx' });
				return { storageKey, sizeBytes: buffer.length, mimeType: mimeType || null };
			} catch (error) {
				if (error.code === 'EEXIST') continue;
				throw storageFailure(error, 'Unable to store the uploaded file.');
			}
		}
		throw new AppError('Unable to store the uploaded file.', 500, 'STORAGE_ERROR');
	}

	async function open(storageKey) {
		const destination = resolveStoredPath(storageKey);
		try {
			const stats = await fs.stat(destination);
			if (!stats.isFile()) {
				throw new AppError('The requested file was not found.', 404, 'FILE_NOT_FOUND');
			}
			return {
				storageKey,
				sizeBytes: stats.size,
				stream: createReadStream(destination),
			};
		} catch (error) {
			if (error instanceof AppError) throw error;
			if (error.code === 'ENOENT') {
				throw new AppError('The requested file was not found.', 404, 'FILE_NOT_FOUND');
			}
			throw storageFailure(error, 'Unable to read the stored file.');
		}
	}

	async function remove(storageKey) {
		const destination = resolveStoredPath(storageKey);
		try {
			await fs.unlink(destination);
			return { storageKey, deleted: true };
		} catch (error) {
			if (error.code === 'ENOENT') {
				throw new AppError('The requested file was not found.', 404, 'FILE_NOT_FOUND');
			}
			throw storageFailure(error, 'Unable to delete the stored file.');
		}
	}

	return {
		name: 'local',
		store,
		open,
		remove,
	};
}

module.exports = {
	createLocalStorageProvider,
	createStorageKey,
};
