process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const service = require('../../src/services/assessments.service');
const repository = require('../../src/repositories/assessments.repository');
const passingRulesService = require('../../src/services/assessment-passing-rules.service');

test('practical score 3 passes when threshold is 3', async () => {
	const originals = {
		findById: repository.findById,
		findWithIncludes: repository.findWithIncludes,
		update: repository.update,
	};
	repository.findById = async () => ({ id: 1, mentor_id: 10, status: 'draft', facility_id: 1, cycle_id: 1, thematic_area_id: 1 });
	repository.findWithIncludes = async () => ({ id: 1, practical_score: 3, practical_passed: true });
	passingRulesService.getActivePassingRule = async () => ({ practical_min_score: 3 });
	repository.update = async (id, data) => ({ id, ...data });
	try {
		const result = await service.setPracticalResult(1, { practical_score: 3 }, { id: 10, role: 'mentor' });
		assert.strictEqual(result.practical_score, 3);
		assert.strictEqual(result.practical_passed, true);
	} finally {
		repository.findById = originals.findById;
		repository.findWithIncludes = originals.findWithIncludes;
		repository.update = originals.update;
	}
});

test('practical score 2 fails when threshold is 3', async () => {
	const originals = {
		findById: repository.findById,
		findWithIncludes: repository.findWithIncludes,
		update: repository.update,
	};
	repository.findById = async () => ({ id: 1, mentor_id: 10, status: 'draft', facility_id: 1, cycle_id: 1, thematic_area_id: 1 });
	repository.findWithIncludes = async () => ({ id: 1, practical_score: 2, practical_passed: false });
	passingRulesService.getActivePassingRule = async () => ({ practical_min_score: 3 });
	repository.update = async (id, data) => ({ id, ...data });
	try {
		const result = await service.setPracticalResult(1, { practical_score: 2 }, { id: 10, role: 'mentor' });
		assert.strictEqual(result.practical_score, 2);
		assert.strictEqual(result.practical_passed, false);
	} finally {
		repository.findById = originals.findById;
		repository.findWithIncludes = originals.findWithIncludes;
		repository.update = originals.update;
	}
});

test('reject practical score below 1', async () => {
	const originals = { findById: repository.findById };
	repository.findById = async () => ({ id: 1, mentor_id: 10, status: 'draft', facility_id: 1 });
	try {
		await assert.rejects(
			service.setPracticalResult(1, { practical_score: 0 }, { id: 10, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
	}
});

test('reject practical score above 5', async () => {
	const originals = { findById: repository.findById };
	repository.findById = async () => ({ id: 1, mentor_id: 10, status: 'draft', facility_id: 1 });
	try {
		await assert.rejects(
			service.setPracticalResult(1, { practical_score: 6 }, { id: 10, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
	}
});

test('mentee cannot submit practical result', async () => {
	const originals = { findById: repository.findById };
	repository.findById = async () => ({ id: 1, mentor_id: 10, status: 'draft', facility_id: 1 });
	try {
		await assert.rejects(
			service.setPracticalResult(1, { practical_score: 4 }, { id: 20, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
	}
});

test('only the assigned mentor can submit a practical result', async () => {
	const originalFindById = repository.findById;
	repository.findById = async () => ({
		id: 1,
		mentor_id: 10,
		status: 'draft',
		facility_id: 1,
	});
	try {
		await assert.rejects(
			service.setPracticalResult(1, { practical_score: 4 }, { id: 1, role: 'admin' }),
			{ statusCode: 403, code: 'FORBIDDEN' }
		);
		await assert.rejects(
			service.setPracticalResult(1, { practical_score: 4 }, { id: 10, role: 'facility_admin', facility_id: 1 }),
			{ statusCode: 403, code: 'FORBIDDEN' }
		);
	} finally {
		repository.findById = originalFindById;
	}
});
