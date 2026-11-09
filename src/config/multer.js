const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const path = require('node:path');
const multer = require('multer');
const env = require('./env');
const AppError = require('../errors/app-error');

const UPLOAD_FIELD_NAME = 'file';

const ALLOWED_RESOURCE_MIME_TYPES = Object.freeze({
	'application/pdf': 'pdf',
	'audio/mpeg': 'audio',
	'audio/mp3': 'audio',
	'audio/mp4': 'audio',
	'audio/wav': 'audio',
	'audio/x-wav': 'audio',
	'audio/webm': 'audio',
	'video/mp4': 'video',
	'video/webm': 'video',
	'video/quicktime': 'video',
});

function startsWith(buffer, bytes, offset = 0) {
	if (!buffer || buffer.length < offset + bytes.length) return false;
	return bytes.every((value, index) => buffer[offset + index] === value);
}

function asciiAt(buffer, offset, length) {
	if (!buffer || buffer.length < offset + length) return '';
	return buffer.subarray(offset, offset + length).toString('ascii');
}

function detectSignatureKind(buffer) {
	if (!buffer || !buffer.length) return 'empty';
	if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2D])) return 'pdf';
	if (startsWith(buffer, [0x4D, 0x5A]) || startsWith(buffer, [0x7F, 0x45, 0x4C, 0x46]) || startsWith(buffer, [0x23, 0x21])) {
		return 'rejected';
	}
	if (asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === 'WAVE') return 'wav';
	if (asciiAt(buffer, 0, 4) === 'RIFF') return 'rejected';
	if (startsWith(buffer, [0x1A, 0x45, 0xDF, 0xA3])) return 'webm';
	if (asciiAt(buffer, 4, 4) === 'ftyp') return 'mp4';
	if (startsWith(buffer, [0x49, 0x44, 0x33])) return 'mp3';
	if (buffer.length >= 2 && buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return 'mp3';
	return 'unknown';
}

function signatureMatchesMime(kind, mimeFamily) {
	if (kind === 'pdf') return mimeFamily === 'pdf';
	if (kind === 'wav') return mimeFamily === 'audio';
	if (kind === 'webm') return mimeFamily === 'audio' || mimeFamily === 'video';
	if (kind === 'mp4') return mimeFamily === 'audio' || mimeFamily === 'video';
	if (kind === 'mp3') return mimeFamily === 'audio';
	return false;
}

function displayNameFrom(originalName) {
	if (typeof originalName !== 'string' || !originalName.trim()) return null;
	const base = path.basename(originalName.replace(/\\/g, '/')).trim();
	return base || null;
}

function inspectUploadedFile(file, { maxBytes = env.UPLOAD_MAX_BYTES } = {}) {
	if (!file) {
		throw new AppError('A file is required.', 400, 'FILE_REQUIRED');
	}
	let body = file.buffer;
	let size = file.size;
	if (!Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
		if (!file.path) {
			throw new AppError('A file is required.', 400, 'FILE_REQUIRED');
		}
		const stats = fs.statSync(file.path);
		size = stats.size;
		body = fs.readFileSync(file.path);
		try { fs.unlinkSync(file.path); } catch (_) {}
	}
	const buffer = Buffer.from(body);
	if (!buffer.length || Number(size || 0) === 0) {
		throw new AppError('The uploaded file is empty.', 400, 'FILE_EMPTY');
	}
	if (buffer.length > maxBytes || Number(size || 0) > maxBytes) {
		throw new AppError('The uploaded file exceeds the maximum allowed size.', 400, 'FILE_TOO_LARGE');
	}

	const declaredMime = String(file.mimetype || '').trim().toLowerCase();
	const mimeFamily = ALLOWED_RESOURCE_MIME_TYPES[declaredMime];
	if (!mimeFamily) {
		throw new AppError('Only PDF, audio, and video files are allowed.', 400, 'FILE_TYPE_UNSUPPORTED');
	}

	const kind = detectSignatureKind(buffer);
	if (kind === 'empty') {
		throw new AppError('The uploaded file is empty.', 400, 'FILE_EMPTY');
	}
	if (kind === 'rejected') {
		throw new AppError('Only PDF, audio, and video files are allowed.', 400, 'FILE_TYPE_UNSUPPORTED');
	}
	if (kind === 'unknown') {
		throw new AppError(
			'The file type could not be verified from its contents. Upload a PDF, MP3, WAV, MP4, MOV, or WebM file.',
			400,
			'FILE_TYPE_UNIDENTIFIED'
		);
	}
	if (!signatureMatchesMime(kind, mimeFamily)) {
		throw new AppError('The file contents do not match the declared file type.', 400, 'FILE_TYPE_MISMATCH');
	}

	return {
		body: buffer,
		mimeType: declaredMime,
		sizeBytes: buffer.length,
		kind: mimeFamily,
		originalName: displayNameFrom(file.originalname),
	};
}

function mapMulterError(error) {
	if (!error) return error;
	if (error instanceof AppError) return error;
	if (error instanceof multer.MulterError) {
		if (error.code === 'LIMIT_FILE_SIZE') {
			return new AppError('The uploaded file exceeds the maximum allowed size.', 400, 'FILE_TOO_LARGE');
		}
		if (error.code === 'LIMIT_UNEXPECTED_FILE') {
			return new AppError('Upload the file using the "file" field.', 400, 'VALIDATION_ERROR');
		}
		if (error.code === 'LIMIT_FILE_COUNT') {
			return new AppError('Only one file may be uploaded.', 400, 'VALIDATION_ERROR');
		}
		return new AppError('The uploaded file is invalid.', 400, 'VALIDATION_ERROR');
	}
	return error;
}

const resourceUpload = multer({
	storage: multer.diskStorage({
		destination: (_req, _file, cb) => cb(null, os.tmpdir()),
		filename: (_req, _file, cb) => cb(null, `upload-${crypto.randomUUID()}`),
	}),
	limits: {
		fileSize: env.UPLOAD_MAX_BYTES,
		files: 1,
	},
	fileFilter: (_req, file, callback) => {
		const declaredMime = String(file?.mimetype || '').trim().toLowerCase();
		if (!ALLOWED_RESOURCE_MIME_TYPES[declaredMime]) {
			return callback(new AppError('Only PDF, audio, and video files are allowed.', 400, 'FILE_TYPE_UNSUPPORTED'));
		}
		return callback(null, true);
	},
});

const quizPdfUpload = multer({
	storage: multer.diskStorage({
		destination: (_req, _file, cb) => cb(null, os.tmpdir()),
		filename: (_req, _file, cb) => cb(null, `quiz-import-${crypto.randomUUID()}`),
	}),
	limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 2 },
	fileFilter: (_req, file, callback) => {
		if (String(file?.mimetype || '').trim().toLowerCase() !== 'application/pdf') {
			return callback(new AppError('Quiz imports accept PDF files only.', 400, 'FILE_TYPE_UNSUPPORTED'));
		}
		return callback(null, true);
	},
});

module.exports = {
	UPLOAD_FIELD_NAME,
	ALLOWED_RESOURCE_MIME_TYPES,
	detectSignatureKind,
	inspectUploadedFile,
	mapMulterError,
	resourceUpload,
	quizPdfUpload,
};
