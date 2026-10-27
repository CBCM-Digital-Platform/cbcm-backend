// tests/unit/logbook.test.js
process.env.JWT_SECRET = 'logbook-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const service = require('../../src/services/logbook.service');
const repository = require('../../src/repositories/logbook.repository');
const LogbookStatus = require('../../src/enums/logbook-status.enum');
const models = require('../../src/models');
const { Assignment } = models;

test('logbook status enum defines valid transitions', () => {
	assert.strictEqual(LogbookStatus.DRAFT, 'draft');
	assert.strictEqual(LogbookStatus.SUBMITTED, 'submitted');
	assert.strictEqual(LogbookStatus.APPROVED, 'approved');
	assert.strictEqual(LogbookStatus.NEEDS_REVISION, 'needs_revision');
	assert.strictEqual(LogbookStatus.REJECTED, 'rejected');
	assert.strictEqual(LogbookStatus.CANCELLED, 'cancelled');

	assert.strictEqual(LogbookStatus.isValidTransition(LogbookStatus.DRAFT, LogbookStatus.SUBMITTED), true);
	assert.strictEqual(LogbookStatus.isValidTransition(LogbookStatus.DRAFT, LogbookStatus.DRAFT), true);
	assert.strictEqual(LogbookStatus.isValidTransition(LogbookStatus.DRAFT, LogbookStatus.APPROVED), false);
	assert.strictEqual(LogbookStatus.isValidTransition(LogbookStatus.SUBMITTED, LogbookStatus.APPROVED), true);
	assert.strictEqual(LogbookStatus.isValidTransition(LogbookStatus.SUBMITTED, LogbookStatus.NEEDS_REVISION), true);
	assert.strictEqual(LogbookStatus.isValidTransition(LogbookStatus.APPROVED, LogbookStatus.DRAFT), false);
	assert.strictEqual(LogbookStatus.isValidTransition(LogbookStatus.NEEDS_REVISION, LogbookStatus.DRAFT), true);
});

test('logbook service validates mentee role before creation', async () => {
	const originals = {
		User: { ...models.User },
		Assignment: { ...models.Assignment },
		LogbookCreate: repository.create,
		findById: repository.findById,
	};

	models.User.findByPk = async (id) => {
		if (id === 1) return { id: 1, role: 'mentee', facility_id: 1 };
		if (id === 2) return { id: 2, role: 'mentor' };
		return null;
	};
	models.Assignment.findOne = async () => ({ id: 1, status: 'assigned' });
	repository.create = async (data) => ({ id: 10, created_by: 2, ...data });
	repository.findById = async (id) => ({ id: 10, mentee_id: 1, status: 'draft' });

	try {
		const result = await service.createLogbook(
			{ mentee_id: 1, procedure_type: 'Test Procedure', hours: 2 },
			{ id: 2, role: 'mentor' }
		);
		assert.strictEqual(result.mentee_id, 1);
		assert.strictEqual(result.status, 'draft');

		await assert.rejects(
			service.createLogbook({ mentee_id: 2, procedure_type: 'Test', hours: 1 }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);

		// Mentees can create their own entries
		const menteeResult = await service.createLogbook(
			{ mentee_id: 1, procedure_type: 'Test', hours: 1 },
			{ id: 1, role: 'mentee' }
		);
		assert.strictEqual(menteeResult.mentee_id, 1);
		assert.strictEqual(menteeResult.status, 'draft');
	} finally {
		Object.assign(models.User, originals.User);
		Object.assign(models.Assignment, originals.Assignment);
		repository.create = originals.LogbookCreate;
		repository.findById = originals.findById;
	}
});

test('logbook service prevents mentees from updating other mentees entries', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'draft' });
	repository.update = async () => ({ id, mentee_id: 1, status: 'draft' });

	try {
		await assert.rejects(
			service.updateLogbook(1, { procedure_type: 'Updated' }, { id: 2, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('logbook service prevents editing approved entries', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'approved' });
	repository.update = async () => ({ id, status: 'approved' });

	try {
		await assert.rejects(
			service.updateLogbook(1, { procedure_type: 'Updated' }, { id: 1, role: 'mentee' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('logbook service validates hours bounds', async () => {
	const originals = {
		User: { ...models.User },
		findById: repository.findById,
		create: repository.create,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1 });
	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'draft' });
	repository.create = async (data) => ({ id: 10, ...data });

	try {
		await assert.rejects(
			service.createLogbook({ mentee_id: 1, hours: 25 }, { id: 1, role: 'mentee' }),
			{ statusCode: 400 }
		);

		await assert.rejects(
			service.createLogbook({ mentee_id: 1, hours: -1 }, { id: 1, role: 'mentee' }),
			{ statusCode: 400 }
		);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findById = originals.findById;
		repository.create = originals.create;
	}
});

test('logbook service validates goal progress bounds', async () => {
	const originals = {
		User: { ...models.User },
		findById: repository.findById,
		create: repository.create,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 1 });
	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'draft' });
	repository.create = async (data) => ({ id: 10, ...data });

	try {
		await assert.rejects(
			service.createLogbook({ mentee_id: 1, goal_progress: 101 }, { id: 1, role: 'mentee' }),
			{ statusCode: 400 }
		);

		await assert.rejects(
			service.createLogbook({ mentee_id: 1, goal_progress: -1 }, { id: 1, role: 'mentee' }),
			{ statusCode: 400 }
		);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findById = originals.findById;
		repository.create = originals.create;
	}
});

test('logbook service enforces valid status transitions', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'approved' });
	repository.update = async () => ({ id, status: 'draft' });

	try {
		await assert.rejects(
			service.updateLogbook(1, { status: 'draft' }, { id: 1, role: 'mentee' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('logbook service prevents mentees from approving their own entries', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'submitted' });
	repository.update = async () => ({ id, status: 'approved' });

	try {
		await assert.rejects(
			service.approveLogbook(1, { id: 1, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('logbook service requires revision reason for revision requests', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
		Assignment: { ...models.Assignment },
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'submitted' });
	repository.update = async () => ({ id, status: 'needs_revision' });
	models.Assignment.findOne = async () => ({ id: 1, status: 'assigned' });

	try {
		await assert.rejects(
			service.requestRevision(1, { revision_reason: '' }, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);

		await assert.rejects(
			service.requestRevision(1, {}, { id: 2, role: 'mentor' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
		Object.assign(models.Assignment, originals.Assignment);
	}
});

test('logbook service clears approval fields on revision', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
		Assignment: { ...models.Assignment },
	};

	let updatePayload;
	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'submitted' });
	repository.update = async (id, data) => {
		updatePayload = data;
		return true;
	};
	models.Assignment.findOne = async () => ({ id: 1, status: 'assigned' });

	try {
		await service.requestRevision(1, { revision_reason: 'Needs more detail' }, { id: 2, role: 'mentor' });
		assert.strictEqual(updatePayload.mentor_approval, false);
		assert.strictEqual(updatePayload.approved_by, null);
		assert.strictEqual(updatePayload.approved_at, null);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
		Object.assign(models.Assignment, originals.Assignment);
	}
});

test('logbook service sets approval metadata on approval', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
		Assignment: { ...models.Assignment },
	};

	let updatePayload;
	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'submitted' });
	repository.update = async (id, data) => {
		updatePayload = data;
		return true;
	};
	models.Assignment.findOne = async () => ({ id: 1, status: 'assigned' });

	try {
		await service.approveLogbook(1, { id: 2, role: 'mentor' });
		assert.strictEqual(updatePayload.status, 'approved');
		assert.strictEqual(updatePayload.mentor_approval, true);
		assert.strictEqual(updatePayload.approved_by, 2);
		assert.strictEqual(updatePayload.approved_at !== undefined, true);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
		Object.assign(models.Assignment, originals.Assignment);
	}
});

test('logbook service enforces facility scope for facility admins', async () => {
	const originals = {
		User: { ...models.User },
		findById: repository.findById,
		create: repository.create,
	};

	models.User.findByPk = async (id) => ({ id, role: 'mentee', facility_id: 5 });
	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'draft' });
	repository.create = async (data) => ({ id: 10, ...data });

	try {
		await assert.rejects(
			service.createLogbook({ mentee_id: 1, procedure_type: 'Test' }, { id: 10, role: 'facility_admin', facility_id: 1 }),
			{ statusCode: 403 }
		);
	} finally {
		Object.assign(models.User, originals.User);
		repository.findById = originals.findById;
		repository.create = originals.create;
	}
});

test('logbook service prevents mentors from accessing unassigned mentees entries', async () => {
	const originals = {
		findById: repository.findById,
		Assignment: { ...models.Assignment },
	};

	repository.findById = async (id) => ({ id, mentee_id: 5, status: 'draft' });
	models.Assignment.findOne = async () => null;

	try {
		await assert.rejects(
			service.getLogbook(1, { id: 2, role: 'mentor' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
		Object.assign(models.Assignment, originals.Assignment);
	}
});

test('logbook service prevents mentees from accessing other mentees entries', async () => {
	const originals = {
		findById: repository.findById,
	};

	repository.findById = async (id) => ({ id, mentee_id: 5, status: 'draft' });

	try {
		await assert.rejects(
			service.getLogbook(1, { id: 1, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
	}
});

test('logbook service validates submission status transition', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'approved' });
	repository.update = async () => ({ id, status: 'submitted' });

	try {
		await assert.rejects(
			service.submitLogbook(1, { id: 1, role: 'mentee' }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('logbook service allows draft to submitted transition', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	let updatePayload;
	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'draft' });
	repository.update = async (id, data) => {
		updatePayload = data;
		return true;
	};

	try {
		const result = await service.submitLogbook(1, { id: 1, role: 'mentee' });
		assert.strictEqual(updatePayload.status, 'submitted');
		// The result comes from findById which still returns draft status in the mock
		// The important part is that updatePayload has the correct status
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('logbook service prevents mentees from submitting other mentees entries', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 5, status: 'draft' });
	repository.update = async () => ({ id, status: 'submitted' });

	try {
		await assert.rejects(
			service.submitLogbook(1, { id: 1, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});

test('logbook service prevents unauthorized users from approving', async () => {
	const originals = {
		findById: repository.findById,
		update: repository.update,
	};

	repository.findById = async (id) => ({ id, mentee_id: 1, status: 'submitted' });
	repository.update = async () => ({ id, status: 'approved' });

	try {
		await assert.rejects(
			service.approveLogbook(1, { id: 1, role: 'mentee' }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originals.findById;
		repository.update = originals.update;
	}
});
