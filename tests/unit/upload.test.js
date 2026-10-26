process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const multer = require('multer');
const {
	ALLOWED_RESOURCE_MIME_TYPES,
	inspectUploadedFile,
	mapMulterError,
} = require('../../src/config/multer');
const { uploadResourceFile } = require('../../src/middlewares/upload.middleware');

const pdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const wavBuffer = Buffer.concat([
	Buffer.from('RIFF'),
	Buffer.alloc(4),
	Buffer.from('WAVEfmt '),
]);
const mp3Buffer = Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const mp4Buffer = Buffer.concat([
	Buffer.from([0x00, 0x00, 0x00, 0x20]),
	Buffer.from('ftypisom'),
	Buffer.alloc(16),
]);
const webmBuffer = Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x01, 0x00, 0x00, 0x00]);

const asFile = ({ body, mimetype, originalname = 'lesson.bin', size }) => ({
	buffer: body,
	mimetype,
	originalname,
	size: size ?? body.length,
});

test('upload validation accepts PDF, audio, and video signatures', () => {
	assert.equal(inspectUploadedFile(asFile({ body: pdfBuffer, mimetype: 'application/pdf' })).kind, 'pdf');
	assert.equal(inspectUploadedFile(asFile({ body: wavBuffer, mimetype: 'audio/wav' })).mimeType, 'audio/wav');
	assert.equal(inspectUploadedFile(asFile({ body: mp3Buffer, mimetype: 'audio/mpeg' })).kind, 'audio');
	assert.equal(inspectUploadedFile(asFile({ body: mp4Buffer, mimetype: 'video/mp4' })).kind, 'video');
	assert.equal(inspectUploadedFile(asFile({ body: webmBuffer, mimetype: 'video/webm' })).kind, 'video');
	assert.equal(
		inspectUploadedFile(asFile({
			body: pdfBuffer,
			mimetype: 'application/pdf',
			originalname: '..\\windows\\lesson.pdf',
		})).originalName,
		'lesson.pdf'
	);
	assert.ok(ALLOWED_RESOURCE_MIME_TYPES['application/pdf']);
});

test('upload validation rejects unsupported types, mismatches, missing files, empty files, and oversized files', () => {
	assert.throws(() => inspectUploadedFile(), { statusCode: 400, code: 'FILE_REQUIRED' });
	assert.throws(() => inspectUploadedFile(asFile({ body: Buffer.alloc(0), mimetype: 'application/pdf' })), {
		statusCode: 400,
		code: 'FILE_EMPTY',
	});
	assert.throws(() => inspectUploadedFile(asFile({ body: pdfBuffer, mimetype: 'application/pdf' }), { maxBytes: 4 }), {
		statusCode: 400,
		code: 'FILE_TOO_LARGE',
	});
	assert.throws(() => inspectUploadedFile(asFile({ body: Buffer.from('MZ'), mimetype: 'application/octet-stream' })), {
		statusCode: 400,
		code: 'FILE_TYPE_UNSUPPORTED',
	});
	assert.throws(() => inspectUploadedFile(asFile({ body: pdfBuffer, mimetype: 'audio/mpeg' })), {
		statusCode: 400,
		code: 'FILE_TYPE_MISMATCH',
	});
	assert.throws(() => inspectUploadedFile(asFile({ body: Buffer.from('not-a-media-file'), mimetype: 'video/mp4' })), {
		statusCode: 400,
		code: 'FILE_TYPE_UNIDENTIFIED',
	});
});

test('multer errors map onto existing application error codes', () => {
	const tooLarge = new multer.MulterError('LIMIT_FILE_SIZE');
	const mapped = mapMulterError(tooLarge);
	assert.equal(mapped.code, 'FILE_TOO_LARGE');
	assert.equal(mapped.statusCode, 400);
	assert.equal(mapMulterError(new multer.MulterError('LIMIT_UNEXPECTED_FILE')).code, 'VALIDATION_ERROR');
	assert.equal(typeof uploadResourceFile, 'function');
});
