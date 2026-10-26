process.env.JWT_SECRET = 'certificate-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const validator = require('../../src/validators/certificates.validator');
const service = require('../../src/services/certificates.service');

test('certificate validators are defined', () => {
	assert.ok(validator.issueCertificateValidation.length > 0);
	assert.ok(validator.eligibilityParamsValidation.length > 0);
});

test('certificate service exports expected functions', () => {
	assert.strictEqual(typeof service.checkEligibility, 'function');
	assert.strictEqual(typeof service.issueCertificate, 'function');
});