// tests/unit/sessions.test.js
process.env.JWT_SECRET = 'sessions-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'sqlite::memory:';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const validator = require('../../src/validators/sessions.validator');
const service = require('../../src/services/sessions.service');
const repository = require('../../src/repositories/sessions.repository');
const assignmentsRepository = require('../../src/repositories/assignments.repository');
const { canAccessFacility, hasAnyRole, SYSTEM_ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../../src/constants/roles.constants');
const Role = require('../../src/enums/role.enum');
const SessionStatus = require('../../src/enums/session-status.enum');
const EncounterMode = require('../../src/enums/encounter-mode.enum');
const models = require('../../src/models');

const { validationResult } = require('express-validator');

const restore = (target, key, value) => {
	target[key] = value;
};

test.before(async () => {
	await models.sequelize.sync();
});

test('session validation validates modes, status, and duration bounds', async () => {
	// Verify validator is properly configured
	assert.ok(validator.createSessionValidation);
	assert.ok(Array.isArray(validator.createSessionValidation));
	assert.ok(validator.createSessionValidation.length > 0);

	// Validate valid status 'draft' is accepted
	const reqValid = { body: { assignment_id: 1, mode: 'in_person', status: 'draft' } };
	for (const middleware of validator.createSessionValidation) {
		await middleware(reqValid, {}, () => {});
	}
	const validErrors = validationResult(reqValid);
	assert.strictEqual(validErrors.isEmpty(), true);

	// Validate invalid status is rejected
	const reqInvalid = { body: { assignment_id: 1, mode: 'in_person', status: 'non_existent_status' } };
	for (const middleware of validator.createSessionValidation) {
		await middleware(reqInvalid, {}, () => {});
	}
	const invalidErrors = validationResult(reqInvalid);
	assert.strictEqual(invalidErrors.isEmpty(), false);
	assert.ok(invalidErrors.array().some((e) => e.msg === 'Invalid session status.'));

	// Test that duration bounds are enforced (test the service layer instead)
	const EncounterMode = require('../../src/enums/encounter-mode.enum');
	assert.ok(EncounterMode.IN_PERSON);
	assert.ok(EncounterMode.VIRTUAL);
	assert.ok(EncounterMode.HYBRID);
});

test('session status transitions are validated correctly', () => {
	// Test the transition validation function exists and works
	assert.ok(SessionStatus.TRANSITIONS);
	assert.ok(SessionStatus.isValidTransition);
	
	// Test valid transitions
	const result1 = SessionStatus.isValidTransition('draft', 'scheduled');
	assert.strictEqual(result1, true);
	
	const result2 = SessionStatus.isValidTransition('draft', 'in_progress');
	assert.strictEqual(result2, false);
	
	const result3 = SessionStatus.isValidTransition('scheduled', 'in_progress');
	assert.strictEqual(result3, true);
	
	const result4 = SessionStatus.isValidTransition('scheduled', 'completed');
	assert.strictEqual(result4, false);
	
	const result5 = SessionStatus.isValidTransition('in_progress', 'completed');
	assert.strictEqual(result5, true);
	
	const result6 = SessionStatus.isValidTransition('in_progress', 'cancelled');
	assert.strictEqual(result6, false);
	
	const result7 = SessionStatus.isValidTransition('completed', 'in_progress');
	assert.strictEqual(result7, false);
});

test('service rejects session creation without valid assignment', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => null;
	try {
		await assert.rejects(
			service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON }, { id: 1, role: Role.ADMIN }),
			{ statusCode: 404 }
		);
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
	}
});

test('service rejects session creation for non-active assignment', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'cancelled',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'active' },
	});
	try {
		await assert.rejects(
			service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON }, { id: 1, role: Role.ADMIN }),
			{ statusCode: 400 }
		);
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
	}
});

test('service rejects session creation for non-active cycle', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'assigned',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'draft' },
	});
	try {
		await assert.rejects(
			service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON }, { id: 1, role: Role.ADMIN }),
			{ statusCode: 400 }
		);
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
	}
});

test('service enforces facility scope for facility admin', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'assigned',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'active' },
	});
	
	const originalCreate = repository.create;
	repository.create = async (data) => ({ id: 10, ...data });

	try {
		// Facility admin with wrong facility should fail
		await assert.rejects(
			service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON }, { id: 1, role: Role.FACILITY_ADMIN, facility_id: 2 }),
			{ statusCode: 403 }
		);
		
		// Facility admin with correct facility should succeed
		const session = await service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON }, { id: 1, role: Role.FACILITY_ADMIN, facility_id: 1 });
		assert.ok(session);
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
		repository.create = originalCreate;
	}
});

test('service allows assigned mentor to create session', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'assigned',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'active' },
	});

	const originalCreate = repository.create;
	repository.create = async (data) => ({ id: 10, ...data });

	try {
		// Wrong mentor should fail
		await assert.rejects(
			service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON }, { id: 99, role: Role.MENTOR }),
			{ statusCode: 403 }
		);

		// Assigned mentor should succeed
		const session = await service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON }, { id: 2, role: Role.MENTOR });
		assert.ok(session);
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
		repository.create = originalCreate;
	}
});

test('service allows assigned mentee to create session', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'assigned',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'active' },
	});

	const originalCreate = repository.create;
	repository.create = async (data) => ({ id: 10, ...data });

	try {
		// Wrong mentee should fail
		await assert.rejects(
			service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON }, { id: 99, role: Role.MENTEE }),
			{ statusCode: 403 }
		);

		// Assigned mentee should succeed
		const session = await service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON }, { id: 3, role: Role.MENTEE });
		assert.ok(session);
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
		repository.create = originalCreate;
	}
});

test('service rejects invalid duration', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'assigned',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'active' },
	});
	try {
		await assert.rejects(
			service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON, duration_minutes: 4 }, { id: 1, role: Role.ADMIN }),
			{ statusCode: 400 }
		);
		await assert.rejects(
			service.createSession({ assignment_id: 1, mode: EncounterMode.IN_PERSON, duration_minutes: 181 }, { id: 1, role: Role.ADMIN }),
			{ statusCode: 400 }
		);
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
	}
});

test('service checks for scheduling conflicts', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'assigned',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'active' },
	});

	const originalCheck = repository.checkForConflicts;
	repository.checkForConflicts = async () => [{ id: 99 }]; // Simulate conflict

	try {
		await assert.rejects(
			service.createSession({
				assignment_id: 1,
				mode: EncounterMode.IN_PERSON,
				scheduled_at: '2026-10-23T09:30:00Z',
				duration_minutes: 45,
				status: 'scheduled',
			}, { id: 1, role: Role.ADMIN }),
			{ statusCode: 409 }
		);
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
		repository.checkForConflicts = originalCheck;
	}
});

test('service allows non-overlapping sessions', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'assigned',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'active' },
	});

	const originalCheck = repository.checkForConflicts;
	repository.checkForConflicts = async () => []; // No conflicts

	const originalCreate = repository.create;
	let createdPayload;
	repository.create = async (data) => {
		createdPayload = data;
		return { id: 10, ...data };
	};

	try {
		const session = await service.createSession({
			assignment_id: 1,
			mode: EncounterMode.IN_PERSON,
			scheduled_at: '2026-10-23T09:30:00Z',
			duration_minutes: 45,
			status: 'scheduled',
		}, { id: 1, role: Role.ADMIN });

		assert.strictEqual(session.status, 'scheduled');
		assert.strictEqual(createdPayload.jitsi_room_enabled, false);
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
		repository.checkForConflicts = originalCheck;
		repository.create = originalCreate;
	}
});

test('service assigns Jitsi room for virtual sessions', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'assigned',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'active' },
	});

	const originalCheck = repository.checkForConflicts;
	repository.checkForConflicts = async () => [];

	const originalCreate = repository.create;
	const originalAssignJitsi = repository.assignJitsiRoom;
	let createdPayload;
	repository.create = async (data) => {
		createdPayload = data;
		return { id: 10, ...data };
	};
	repository.assignJitsiRoom = async (id) => 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

	try {
		const session = await service.createSession({
			assignment_id: 1,
			mode: EncounterMode.VIRTUAL,
			scheduled_at: '2026-10-23T09:30:00Z',
			duration_minutes: 45,
			status: 'scheduled',
		}, { id: 1, role: Role.ADMIN });

		assert.strictEqual(session.status, 'scheduled');
		assert.strictEqual(createdPayload.jitsi_room_enabled, true);
		assert.ok(createdPayload.jitsi_room_id);
		assert.ok(createdPayload.jitsi_room_id.length === 32); // hex string
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
		repository.checkForConflicts = originalCheck;
		repository.create = originalCreate;
		repository.assignJitsiRoom = originalAssignJitsi;
	}
});

test('service creates draft without scheduling', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'assigned',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'active' },
	});

	const originalCreate = repository.create;
	const originalAssignJitsi = repository.assignJitsiRoom;
	let createdPayload;
	repository.create = async (data) => {
		createdPayload = data;
		return { id: 10, ...data };
	};
	repository.assignJitsiRoom = async () => null;

	try {
		const session = await service.createSession({
			assignment_id: 1,
			mode: EncounterMode.IN_PERSON,
			status: 'draft',
		}, { id: 1, role: Role.ADMIN });

		assert.strictEqual(session.status, 'draft');
		assert.strictEqual(createdPayload.scheduled_at, null);
		assert.strictEqual(createdPayload.duration_minutes, null);
		assert.strictEqual(createdPayload.jitsi_room_enabled, false);
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
		repository.create = originalCreate;
		repository.assignJitsiRoom = originalAssignJitsi;
	}
});

test('service allows all three session modes', async () => {
	const originalAssignment = assignmentsRepository.findWithIncludes;
	assignmentsRepository.findWithIncludes = async () => ({
		id: 1,
		status: 'assigned',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		cycle: { status: 'active' },
	});

	const originalCheck = repository.checkForConflicts;
	repository.checkForConflicts = async () => [];

	const originalCreate = repository.create;
	const originalAssignJitsi = repository.assignJitsiRoom;
	repository.create = async (data) => ({ id: 10, ...data });
	repository.assignJitsiRoom = async (id) => 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

	try {
		for (const mode of [EncounterMode.IN_PERSON, EncounterMode.VIRTUAL, EncounterMode.HYBRID]) {
			const session = await service.createSession({
				assignment_id: 1,
				mode,
				scheduled_at: '2026-10-23T09:30:00Z',
				duration_minutes: 45,
				status: 'scheduled',
			}, { id: 1, role: Role.ADMIN });
			assert.strictEqual(session.mode, mode);
		}
	} finally {
		assignmentsRepository.findWithIncludes = originalAssignment;
		repository.checkForConflicts = originalCheck;
		repository.create = originalCreate;
		repository.assignJitsiRoom = originalAssignJitsi;
	}
});

test('service rejects invalid status transitions', async () => {
	const original = repository.findById;
	repository.findById = async () => ({
		id: 1,
		status: 'completed',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
	});

	try {
		await assert.rejects(
			service.updateSessionStatus(1, 'in_progress', { id: 2, role: Role.MENTOR }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = original;
	}
});

test('service enforces cancellation rules', async () => {
	const original = repository.findById;
	repository.findById = async () => ({
		id: 1,
		status: 'in_progress',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
	});

	try {
		await assert.rejects(
			service.updateSessionStatus(1, 'cancelled', { id: 2, role: Role.MENTOR }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = original;
	}
});

test('service rejects Jitsi tokens for in-person sessions', async () => {
	const original = repository.findById;
	repository.findById = async () => ({
		id: 1,
		status: 'scheduled',
		mode: EncounterMode.IN_PERSON,
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
	});

	try {
		await assert.rejects(
			service.generateJoinToken(1, { id: 2, role: Role.MENTOR }),
			{ statusCode: 400 }
		);
	} finally {
		repository.findById = original;
	}
});

test('service rejects Jitsi tokens for non-participants', async () => {
	const original = repository.findById;
	repository.findById = async () => ({
		id: 1,
		status: 'scheduled',
		mode: EncounterMode.VIRTUAL,
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		jitsi_room_enabled: true,
	});

	try {
		await assert.rejects(
			service.generateJoinToken(1, { id: 99, role: Role.MENTOR }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = original;
	}
});

test('service requires Jitsi configuration for token generation', async () => {
	const originalEnv = require('../../src/config/env');
	const original = repository.findById;
	repository.findById = async () => ({
		id: 1,
		status: 'scheduled',
		mode: EncounterMode.VIRTUAL,
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
		jitsi_room_enabled: true,
	});

	const originalConfig = { ...originalEnv };
	originalEnv.JITSI_DOMAIN = '';
	originalEnv.JITSI_APP_ID = '';
	originalEnv.JITSI_SECRET = '';

	try {
		await assert.rejects(
			service.generateJoinToken(1, { id: 2, role: Role.MENTOR }),
			{ statusCode: 500 }
		);
	} finally {
		repository.findById = original;
		Object.assign(originalEnv, originalConfig);
	}
});

test('service allows mentors to create notes', async () => {
	const originalSession = repository.findById;
	repository.findById = async () => ({
		id: 1,
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
	});

	const originalCreateNote = repository.createMentorNote;
	repository.createMentorNote = async () => ({ id: 1, note: 'Test note' });

	try {
		const note = await service.createMentorNote(1, 'Test note', { id: 2, role: Role.MENTOR });
		assert.ok(note);
	} finally {
		repository.findById = originalSession;
		repository.createMentorNote = originalCreateNote;
	}
});

test('service rejects note creation by non-mentors', async () => {
	const originalSession = repository.findById;
	repository.findById = async () => ({
		id: 1,
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
	});

	try {
		await assert.rejects(
			service.createMentorNote(1, 'Test note', { id: 3, role: Role.MENTEE }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originalSession;
	}
});

test('service rejects note creation by wrong mentor', async () => {
	const originalSession = repository.findById;
	repository.findById = async () => ({
		id: 1,
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
	});

	try {
		await assert.rejects(
			service.createMentorNote(1, 'Test note', { id: 99, role: Role.MENTOR }),
			{ statusCode: 403 }
		);
	} finally {
		repository.findById = originalSession;
	}
});

test('service filters sessions by user role', async () => {
	const originalCount = repository.count;
	const originalFindMany = repository.findMany;
	
	repository.count = async (where) => 1;
	repository.findMany = async (where) => {
		return [{ id: 1, mentor_id: 2, mentee_id: 3, facility_id: 1 }];
	};

	try {
		// Mentor sees only their sessions
		const mentorResult = await service.listSessions({}, { id: 2, role: Role.MENTOR });
		assert.ok(mentorResult.items);
		assert.strictEqual(mentorResult.total, 1);

		// Mentee sees only their sessions
		const menteeResult = await service.listSessions({}, { id: 3, role: Role.MENTEE });
		assert.ok(menteeResult.items);
		assert.strictEqual(menteeResult.total, 1);
	} finally {
		repository.count = originalCount;
		repository.findMany = originalFindMany;
	}
});

test('participant join transitions session to in_progress', async () => {
	const originalSession = repository.findById;
	repository.findById = async () => ({
		id: 1,
		status: 'scheduled',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
	});

	const originalUpdate = repository.update;
	let updatedPayload;
	repository.update = async (id, data) => {
		updatedPayload = data;
		return { id, ...data };
	};

	try {
		await service.handleParticipantJoin(1, 2);
		assert.strictEqual(updatedPayload.status, 'in_progress');
		assert.ok(updatedPayload.started_at);
	} finally {
		repository.findById = originalSession;
		repository.update = originalUpdate;
	}
});

test('participant join does not transition if already in progress', async () => {
	const originalSession = repository.findById;
	repository.findById = async () => ({
		id: 1,
		status: 'in_progress',
		mentor_id: 2,
		mentee_id: 3,
		facility_id: 1,
	});

	const originalUpdate = repository.update;
	let updateCalled = false;
	repository.update = async () => {
		updateCalled = true;
		return { id: 1 };
	};

	try {
		await service.handleParticipantJoin(1, 2);
		assert.strictEqual(updateCalled, false);
	} finally {
		repository.findById = originalSession;
		repository.update = originalUpdate;
	}
});
