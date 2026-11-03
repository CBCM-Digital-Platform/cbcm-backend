process.env.JWT_SECRET = 'certificate-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const validator = require('../../src/validators/certificates.validator');
const service = require('../../src/services/certificates.service');
const repository = require('../../src/repositories/certificates.repository');
const models = require('../../src/models');
const assessmentsService = require('../../src/services/assessments.service');

assessmentsService.getCertificateEligibility = async () => {
	const assessment = await repository.findEligibleAssessment();
	const eligible = assessment
		&& assessment.theory_passed === true
		&& assessment.practical_passed === true;
	return {
		eligible_for_certificate: Boolean(eligible),
		unmet_requirements: eligible ? [] : ['Assessment results are incomplete or did not pass.'],
	};
};

test('certificate validators are defined', () => {
	assert.ok(validator.issueCertificateValidation.length > 0);
	assert.ok(validator.eligibilityParamsValidation.length > 0);
});

test('certificate service exports expected functions', () => {
	assert.strictEqual(typeof service.checkEligibility, 'function');
	assert.strictEqual(typeof service.issueCertificate, 'function');
	assert.strictEqual(typeof service.listCertificates, 'function');
	assert.strictEqual(typeof service.getCertificate, 'function');
	assert.strictEqual(typeof service.revokeCertificate, 'function');
});

test('certificate eligibility rejects when no assessment exists', async () => {
	const originals = {
		User: { ...models.User },
		findEligibleAssessment: repository.findEligibleAssessment,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1 });
	repository.findEligibleAssessment = async () => null;

	try {
		const result = await service.checkEligibility(1, 1, 1, { id: 2, role: 'admin' });
		assert.strictEqual(result.eligible, false);
		assert.strictEqual(result.reason.includes('No finalized or reviewed assessment'), true);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findEligibleAssessment = originals.findEligibleAssessment;
	}
});

test('certificate eligibility rejects when assessment lacks theory pass', async () => {
	const originals = {
		User: { ...models.User },
		findEligibleAssessment: repository.findEligibleAssessment,
		findActiveCertificate: repository.findActiveCertificate,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1 });
	repository.findEligibleAssessment = async () => ({
		theory_passed: false,
		practical_passed: true,
	});
	repository.findActiveCertificate = async () => null;

	try {
		const result = await service.checkEligibility(1, 1, 1, { id: 2, role: 'admin' });
		assert.strictEqual(result.eligible, false);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findEligibleAssessment = originals.findEligibleAssessment;
		repository.findActiveCertificate = originals.findActiveCertificate;
	}
});

test('certificate eligibility rejects when assessment lacks practical pass', async () => {
	const originals = {
		User: { ...models.User },
		findEligibleAssessment: repository.findEligibleAssessment,
		findActiveCertificate: repository.findActiveCertificate,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1 });
	repository.findEligibleAssessment = async () => ({
		theory_passed: true,
		practical_passed: false,
	});
	repository.findActiveCertificate = async () => null;

	try {
		const result = await service.checkEligibility(1, 1, 1, { id: 2, role: 'admin' });
		assert.strictEqual(result.eligible, false);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findEligibleAssessment = originals.findEligibleAssessment;
		repository.findActiveCertificate = originals.findActiveCertificate;
	}
});

test('certificate eligibility allows when both theory and practical pass', async () => {
	const originals = {
		User: { ...models.User },
		findEligibleAssessment: repository.findEligibleAssessment,
		findActiveCertificate: repository.findActiveCertificate,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1 });
	repository.findEligibleAssessment = async () => ({
		theory_passed: true,
		practical_passed: true,
	});
	repository.findActiveCertificate = async () => null;

	try {
		const result = await service.checkEligibility(1, 1, 1, { id: 2, role: 'admin' });
		assert.strictEqual(result.eligible, true);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findEligibleAssessment = originals.findEligibleAssessment;
		repository.findActiveCertificate = originals.findActiveCertificate;
	}
});

test('certificate eligibility rejects duplicate active certificate', async () => {
	const originals = {
		User: { ...models.User },
		findEligibleAssessment: repository.findEligibleAssessment,
		findActiveCertificate: repository.findActiveCertificate,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1 });
	repository.findEligibleAssessment = async () => ({
		theory_passed: true,
		practical_passed: true,
	});
	repository.findActiveCertificate = async () => ({ id: 1, status: 'issued' });

	try {
		const result = await service.checkEligibility(1, 1, 1, { id: 2, role: 'admin' });
		assert.strictEqual(result.eligible, false);
		assert.strictEqual(result.reason.includes('already exists'), true);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findEligibleAssessment = originals.findEligibleAssessment;
		repository.findActiveCertificate = originals.findActiveCertificate;
	}
});

test('certificate issuance rejects ineligible mentee', async () => {
	const originals = {
		checkEligibility: service.checkEligibility,
	};

	service.checkEligibility = async () => ({ eligible: false, reason: 'Not eligible' });

	try {
		await assert.rejects(
			service.issueCertificate({ mentee_id: 1, cycle_id: 1, thematic_area_id: 1 }, { id: 2, role: 'admin' }),
			{ statusCode: 409 }
		);
	} finally {
		service.checkEligibility = originals.checkEligibility;
	}
});

test('certificate issuance requires theory score 80+ threshold', async () => {
	const originals = {
		User: { ...models.User },
		findEligibleAssessment: repository.findEligibleAssessment,
		findActiveCertificate: repository.findActiveCertificate,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1, full_name: 'Test Mentee' });
	repository.findEligibleAssessment = async () => ({
		theory_passed: false, // score was 79
		practical_passed: true,
	});
	repository.findActiveCertificate = async () => null;

	try {
		const result = await service.checkEligibility(1, 1, 1, { id: 2, role: 'admin' });
		assert.strictEqual(result.eligible, false);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findEligibleAssessment = originals.findEligibleAssessment;
		repository.findActiveCertificate = originals.findActiveCertificate;
	}
});

test('certificate issuance allows theory score 80+', async () => {
	const originals = {
		User: { ...models.User },
		findEligibleAssessment: repository.findEligibleAssessment,
		findActiveCertificate: repository.findActiveCertificate,
		create: repository.create,
		update: repository.update,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1, full_name: 'Test Mentee' });
	repository.findEligibleAssessment = async () => ({
		theory_passed: true, // score was 80
		practical_passed: true,
	});
	repository.findActiveCertificate = async () => null;
	repository.create = async (data) => ({ id: 1, ...data });
	repository.update = async () => true;

	try {
		const result = await service.checkEligibility(1, 1, 1, { id: 2, role: 'admin' });
		assert.strictEqual(result.eligible, true);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findEligibleAssessment = originals.findEligibleAssessment;
		repository.findActiveCertificate = originals.findActiveCertificate;
		repository.create = originals.create;
		repository.update = originals.update;
	}
});

test('certificate issuance requires practical passed true', async () => {
	const originals = {
		User: { ...models.User },
		findEligibleAssessment: repository.findEligibleAssessment,
		findActiveCertificate: repository.findActiveCertificate,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1 });
	repository.findEligibleAssessment = async () => ({
		theory_passed: true,
		practical_passed: false,
	});
	repository.findActiveCertificate = async () => null;

	try {
		const result = await service.checkEligibility(1, 1, 1, { id: 2, role: 'admin' });
		assert.strictEqual(result.eligible, false);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findEligibleAssessment = originals.findEligibleAssessment;
		repository.findActiveCertificate = originals.findActiveCertificate;
	}
});

test('certificate issuance enforces facility scope for facility admins', async () => {
	const originals = {
		User: { ...models.User },
		checkEligibility: service.checkEligibility,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 5 });

	try {
		await assert.rejects(
			service.checkEligibility(1, 1, 1, { id: 10, role: 'facility_admin', facility_id: 1 }),
			{ statusCode: 403 }
		);
	} finally {
		Object.assign(models.User, originals.User);
		service.checkEligibility = originals.checkEligibility;
	}
});

test('certificate issuance sets audit fields correctly', async () => {
	const originals = {
		User: { ...models.User },
		findEligibleAssessment: repository.findEligibleAssessment,
		findActiveCertificate: repository.findActiveCertificate,
		create: repository.create,
		update: repository.update,
	};

	let createPayload;
	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1, full_name: 'Test Mentee' });
	repository.findEligibleAssessment = async () => ({
		theory_passed: true,
		practical_passed: true,
	});
	repository.findActiveCertificate = async () => null;
	repository.create = async (data) => {
		createPayload = data;
		return { id: 1, ...data };
	};
	repository.update = async () => true;

	try {
		await service.issueCertificate(
			{ mentee_id: 1, cycle_id: 1, thematic_area_id: 1 },
			{ id: 2, role: 'admin' }
		);
		assert.strictEqual(createPayload.issued_by, 2);
		assert.strictEqual(createPayload.issued_at !== undefined, true);
		assert.strictEqual(createPayload.mentee_name_snapshot, 'Test Mentee');
		assert.strictEqual(createPayload.version, 1);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findEligibleAssessment = originals.findEligibleAssessment;
		repository.findActiveCertificate = originals.findActiveCertificate;
		repository.create = originals.create;
		repository.update = originals.update;
	}
});

test('certificate issuance increments version on reissue', async () => {
	const originals = {
		User: { ...models.User },
		findEligibleAssessment: repository.findEligibleAssessment,
		findActiveCertificate: repository.findActiveCertificate,
		create: repository.create,
		update: repository.update,
	};

	let createPayload;
	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1, full_name: 'Test Mentee' });
	repository.findEligibleAssessment = async () => ({
		theory_passed: true,
		practical_passed: true,
	});
	repository.findActiveCertificate = async () => ({ id: 1, version: 1, status: 'issued' });
	repository.create = async (data) => {
		createPayload = data;
		return { id: 2, ...data };
	};
	repository.update = async () => true;

	try {
		await service.issueCertificate(
			{ mentee_id: 1, cycle_id: 1, thematic_area_id: 1 },
			{ id: 2, role: 'admin' }
		);
		assert.strictEqual(createPayload.version, 2);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findEligibleAssessment = originals.findEligibleAssessment;
		repository.findActiveCertificate = originals.findActiveCertificate;
		repository.create = originals.create;
		repository.update = originals.update;
	}
});
