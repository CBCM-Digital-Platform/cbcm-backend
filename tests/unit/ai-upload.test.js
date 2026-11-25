process.env.NODE_ENV = 'test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
	inspectAiDocumentUpload,
	ALLOWED_AI_DOCUMENT_MIME_TYPES,
} = require('../../src/config/multer');

const PDF_MIME = 'application/pdf';
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fakeFile({ mime, buffer, name = 'doc.bin', size }) {
	return {
		mimetype: mime,
		originalname: name,
		buffer,
		size: size ?? buffer.length,
	};
}

const pdfBuffer = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 0x20)]);
const docxBuffer = Buffer.concat([Buffer.from([0x50, 0x4B, 0x03, 0x04]), Buffer.alloc(64, 0x20)]);
const exeBuffer = Buffer.concat([Buffer.from([0x4D, 0x5A]), Buffer.alloc(64, 0x20)]);

test('accepts a valid PDF upload', () => {
	const result = inspectAiDocumentUpload(fakeFile({ mime: PDF_MIME, buffer: pdfBuffer, name: 'guide.pdf' }));
	assert.equal(result.mimeType, PDF_MIME);
	assert.equal(result.kind, 'pdf');
	assert.equal(result.originalName, 'guide.pdf');
});

test('accepts a valid DOCX upload', () => {
	const result = inspectAiDocumentUpload(fakeFile({ mime: DOCX_MIME, buffer: docxBuffer, name: 'manual.docx' }));
	assert.equal(result.kind, 'docx');
});

test('rejects missing file', () => {
	assert.throws(() => inspectAiDocumentUpload(null), { statusCode: 400, code: 'FILE_REQUIRED' });
});

test('rejects unsupported MIME types', () => {
	assert.throws(
		() => inspectAiDocumentUpload(fakeFile({ mime: 'text/plain', buffer: pdfBuffer })),
		{ statusCode: 400, code: 'FILE_TYPE_UNSUPPORTED' }
	);
	assert.throws(
		() => inspectAiDocumentUpload(fakeFile({ mime: 'image/png', buffer: pdfBuffer })),
		{ statusCode: 400, code: 'FILE_TYPE_UNSUPPORTED' }
	);
});

test('rejects content/signature mismatch', () => {
	assert.throws(
		() => inspectAiDocumentUpload(fakeFile({ mime: PDF_MIME, buffer: exeBuffer })),
		{ statusCode: 400, code: 'FILE_TYPE_MISMATCH' }
	);
	assert.throws(
		() => inspectAiDocumentUpload(fakeFile({ mime: DOCX_MIME, buffer: pdfBuffer })),
		{ statusCode: 400, code: 'FILE_TYPE_MISMATCH' }
	);
});

test('rejects empty and oversized files', () => {
	assert.throws(
		() => inspectAiDocumentUpload(fakeFile({ mime: PDF_MIME, buffer: Buffer.alloc(0) })),
		{ statusCode: 400, code: 'FILE_EMPTY' }
	);
	assert.throws(
		() => inspectAiDocumentUpload(fakeFile({ mime: PDF_MIME, buffer: pdfBuffer }), { maxBytes: 10 }),
		{ statusCode: 400, code: 'FILE_TOO_LARGE' }
	);
});

test('only PDF and DOCX MIME types are allow-listed', () => {
	assert.deepEqual(Object.keys(ALLOWED_AI_DOCUMENT_MIME_TYPES).sort(), [DOCX_MIME, PDF_MIME].sort());
});
