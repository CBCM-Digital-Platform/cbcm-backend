const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const path = require('node:path');
const multer = require('multer');
const env = require('./env');
const AppError = require('../errors/app-error');

const UPLOAD_FIELD_NAME = 'file';
const EXAM_CSV_MIME_TYPES = new Set([
	'text/csv',
	'application/csv',
	'application/vnd.ms-excel',
	'text/plain',
	'application/octet-stream',
]);

const ALLOWED_RESOURCE_MIME_TYPES = Object.freeze({
	'application/pdf': 'pdf',
	'application/vnd.ms-powerpoint': 'presentation',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'presentation',
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

function isPowerPointPackage(buffer) {
	const minimumEndRecordSize = 22;
	const maximumCommentSize = 0xFFFF;
	const searchStart = Math.max(0, buffer.length - minimumEndRecordSize - maximumCommentSize);
	let endRecordOffset = -1;
	for (let offset = buffer.length - minimumEndRecordSize; offset >= searchStart; offset -= 1) {
		if (buffer.readUInt32LE(offset) === 0x06054B50) {
			endRecordOffset = offset;
			break;
		}
	}
	if (endRecordOffset < 0 || endRecordOffset + minimumEndRecordSize > buffer.length) return false;
	const entryCount = buffer.readUInt16LE(endRecordOffset + 10);
	const directorySize = buffer.readUInt32LE(endRecordOffset + 12);
	let offset = buffer.readUInt32LE(endRecordOffset + 16);
	const directoryEnd = offset + directorySize;
	if (directoryEnd > endRecordOffset || directoryEnd > buffer.length) return false;
	const names = new Set();
	for (let entry = 0; entry < entryCount; entry += 1) {
		if (offset + 46 > directoryEnd || buffer.readUInt32LE(offset) !== 0x02014B50) return false;
		const nameLength = buffer.readUInt16LE(offset + 28);
		const extraLength = buffer.readUInt16LE(offset + 30);
		const commentLength = buffer.readUInt16LE(offset + 32);
		const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
		if (nextOffset > directoryEnd) return false;
		const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
		const compressedSize = buffer.readUInt32LE(offset + 20);
		const localOffset = buffer.readUInt32LE(offset + 42);
		if (localOffset + 30 > offset || buffer.readUInt32LE(localOffset) !== 0x04034B50) return false;
		const localNameLength = buffer.readUInt16LE(localOffset + 26);
		const localExtraLength = buffer.readUInt16LE(localOffset + 28);
		const localNameStart = localOffset + 30;
		const localDataStart = localNameStart + localNameLength + localExtraLength;
		if (localDataStart + compressedSize > offset) return false;
		if (buffer.subarray(localNameStart, localNameStart + localNameLength).toString('utf8') !== name) return false;
		names.add(name);
		offset = nextOffset;
	}
	return names.has('[Content_Types].xml') && names.has('ppt/presentation.xml');
}

function isLegacyPowerPoint(buffer) {
	const compoundFileSignature = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
	if (!startsWith(buffer, compoundFileSignature)) return false;
	const powerPointStreamName = Buffer.from('PowerPoint Document', 'utf16le');
	return buffer.indexOf(powerPointStreamName) >= 0;
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
	if (isLegacyPowerPoint(buffer)) return 'ppt';
	if (asciiAt(buffer, 0, 4) === 'RIFF' && asciiAt(buffer, 8, 4) === 'WAVE') return 'wav';
	if (asciiAt(buffer, 0, 4) === 'RIFF') return 'rejected';
	if (startsWith(buffer, [0x1A, 0x45, 0xDF, 0xA3])) return 'webm';
	if (asciiAt(buffer, 4, 4) === 'ftyp') return 'mp4';
	if (startsWith(buffer, [0x49, 0x44, 0x33])) return 'mp3';
	if (buffer.length >= 2 && buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) return 'mp3';
	if (startsWith(buffer, [0x50, 0x4B, 0x03, 0x04])) return isPowerPointPackage(buffer) ? 'pptx' : 'unknown';
	return 'unknown';
}

function signatureMatchesMime(kind, mimeFamily, declaredMime) {
	if (kind === 'pdf') return mimeFamily === 'pdf';
	if (kind === 'wav') return mimeFamily === 'audio';
	if (kind === 'webm') return mimeFamily === 'audio' || mimeFamily === 'video';
	if (kind === 'mp4') return mimeFamily === 'audio' || mimeFamily === 'video';
	if (kind === 'mp3') return mimeFamily === 'audio';
	if (kind === 'ppt') return declaredMime === 'application/vnd.ms-powerpoint';
	if (kind === 'pptx') return declaredMime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
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
		throw new AppError('Only PDF, PowerPoint, audio, and video files are allowed.', 400, 'FILE_TYPE_UNSUPPORTED');
	}

	const kind = detectSignatureKind(buffer);
	if (kind === 'empty') {
		throw new AppError('The uploaded file is empty.', 400, 'FILE_EMPTY');
	}
	if (kind === 'rejected') {
		throw new AppError('Only PDF, PowerPoint, audio, and video files are allowed.', 400, 'FILE_TYPE_UNSUPPORTED');
	}
	if (kind === 'unknown') {
		throw new AppError(
			'The file type could not be verified from its contents. Upload a PDF, PPT, PPTX, MP3, WAV, MP4, MOV, or WebM file.',
			400,
			'FILE_TYPE_UNIDENTIFIED'
		);
	}
	if (!signatureMatchesMime(kind, mimeFamily, declaredMime)) {
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
			return callback(new AppError('Only PDF, PowerPoint, audio, and video files are allowed.', 400, 'FILE_TYPE_UNSUPPORTED'));
		}
		return callback(null, true);
	},
});

const ALLOWED_AI_DOCUMENT_MIME_TYPES = Object.freeze({
	'application/pdf': 'pdf',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
});

function inspectAiDocumentUpload(file, { maxBytes = env.UPLOAD_MAX_BYTES } = {}) {
	if (!file) {
		throw new AppError('A file is required.', 400, 'FILE_REQUIRED');
	}
	let body = file.buffer;
	if (!Buffer.isBuffer(body) && !(body instanceof Uint8Array)) {
		if (!file.path) {
			throw new AppError('A file is required.', 400, 'FILE_REQUIRED');
		}
		const stats = fs.statSync(file.path);
		if (stats.size > maxBytes) {
			throw new AppError('The uploaded file exceeds the maximum allowed size.', 400, 'FILE_TOO_LARGE');
		}
		body = fs.readFileSync(file.path);
		try { fs.unlinkSync(file.path); } catch (_) {}
	}
	const buffer = Buffer.from(body);
	if (!buffer.length) {
		throw new AppError('The uploaded file is empty.', 400, 'FILE_EMPTY');
	}
	if (buffer.length > maxBytes) {
		throw new AppError('The uploaded file exceeds the maximum allowed size.', 400, 'FILE_TOO_LARGE');
	}
	const declaredMime = String(file.mimetype || '').trim().toLowerCase();
	const kind = ALLOWED_AI_DOCUMENT_MIME_TYPES[declaredMime];
	if (!kind) {
		throw new AppError('Only PDF and DOCX files are allowed for knowledge documents.', 400, 'FILE_TYPE_UNSUPPORTED');
	}
	const signatureOk = kind === 'pdf'
		? startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2D])
		: startsWith(buffer, [0x50, 0x4B, 0x03, 0x04]) || startsWith(buffer, [0x50, 0x4B, 0x05, 0x06]);
	if (!signatureOk) {
		throw new AppError('The file contents do not match the declared file type.', 400, 'FILE_TYPE_MISMATCH');
	}
	return {
		body: buffer,
		mimeType: declaredMime,
		kind,
		sizeBytes: buffer.length,
		originalName: displayNameFrom(file.originalname),
	};
}

const aiDocumentUpload = multer({
	storage: multer.diskStorage({
		destination: (_req, _file, cb) => cb(null, os.tmpdir()),
		filename: (_req, _file, cb) => cb(null, `ai-document-${crypto.randomUUID()}`),
	}),
	limits: { fileSize: env.UPLOAD_MAX_BYTES, files: 1 },
	fileFilter: (_req, file, callback) => {
		const declaredMime = String(file?.mimetype || '').trim().toLowerCase();
		if (!ALLOWED_AI_DOCUMENT_MIME_TYPES[declaredMime]) {
			return callback(new AppError('Only PDF and DOCX files are allowed for knowledge documents.', 400, 'FILE_TYPE_UNSUPPORTED'));
		}
		return callback(null, true);
	},
});

function inspectExamCsvUpload(file, { maxBytes = env.EXAM_CSV_MAX_BYTES } = {}) {
	if (!file) throw new AppError('A CSV file is required.', 400, 'FILE_REQUIRED');
	const originalName = displayNameFrom(file.originalname);
	if (!originalName || path.extname(originalName).toLowerCase() !== '.csv') {
		throw new AppError('The Exam import file must use the .csv extension.', 400, 'FILE_TYPE_UNSUPPORTED');
	}
	const body = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.buffer || '');
	if (!body.length) throw new AppError('The uploaded CSV file is empty.', 400, 'FILE_EMPTY');
	if (body.length > maxBytes) throw new AppError('The uploaded CSV file exceeds the maximum allowed size.', 400, 'FILE_TOO_LARGE');
	if (body.includes(0)) throw new AppError('The uploaded file is not a valid CSV text file.', 400, 'FILE_TYPE_MISMATCH');
	const declaredMime = String(file.mimetype || '').trim().toLowerCase();
	if (declaredMime && !EXAM_CSV_MIME_TYPES.has(declaredMime)) {
		throw new AppError('Only CSV files are allowed for Exam imports.', 400, 'FILE_TYPE_UNSUPPORTED');
	}
	const text = body.toString('utf8');
	if (text.includes('\uFFFD')) throw new AppError('The CSV file must be valid UTF-8 text.', 400, 'FILE_TYPE_MISMATCH');
	return { body, mimeType: declaredMime || 'text/csv', sizeBytes: body.length, originalName };
}

const examCsvUpload = multer({
	storage: multer.memoryStorage(),
	limits: { fileSize: env.EXAM_CSV_MAX_BYTES, files: 1 },
	fileFilter: (_req, file, callback) => {
		const name = displayNameFrom(file?.originalname);
		const mime = String(file?.mimetype || '').trim().toLowerCase();
		if (!name || path.extname(name).toLowerCase() !== '.csv' || (mime && !EXAM_CSV_MIME_TYPES.has(mime))) {
			return callback(new AppError('Only CSV files are allowed for Exam imports.', 400, 'FILE_TYPE_UNSUPPORTED'));
		}
		return callback(null, true);
	},
});

module.exports = {
	UPLOAD_FIELD_NAME,
	ALLOWED_RESOURCE_MIME_TYPES,
	ALLOWED_AI_DOCUMENT_MIME_TYPES,
	detectSignatureKind,
	inspectUploadedFile,
	inspectAiDocumentUpload,
	mapMulterError,
	resourceUpload,
	aiDocumentUpload,
	EXAM_CSV_MIME_TYPES,
	examCsvUpload,
	inspectExamCsvUpload,
};
