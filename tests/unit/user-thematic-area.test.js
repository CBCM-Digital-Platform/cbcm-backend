// tests/unit/user-thematic-area.test.js
process.env.JWT_SECRET = 'user-thematic-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const authService = require('../../src/services/auth.service');
const authRepository = require('../../src/repositories/auth.repository');
const models = require('../../src/models');

const repoKeys = Object.keys(authRepository);
const originals = Object.fromEntries(repoKeys.map((key) => [key, authRepository[key]]));
const originalUserCreate = models.User.create;
const originalUserFindByPk = models.User.findByPk;
const originalUserFindByEmail = models.User.findOne;
const originalFacilityFindByPk = models.Facility.findByPk;
const originalThematicFindByPk = models.ThematicArea.findByPk;

function restore() {
	for (const key of repoKeys) authRepository[key] = originals[key];
	models.User.create = originalUserCreate;
	models.User.findByPk = originalUserFindByPk;
	models.User.findOne = originalUserFindByEmail;
	models.Facility.findByPk = originalFacilityFindByPk;
	models.ThematicArea.findByPk = originalThematicFindByPk;
}

function fakeUser(overrides = {}) {
	const user = {
		id: 42,
		full_name: 'Test Mentor',
		email: 'mentor@example.com',
		role: 'mentor',
		facility_id: 2,
		thematic_area_id: null,
		status: 'active',
		must_change_password: false,
		update: async function (values) { Object.assign(this, values); },
		toJSON() { const { update, toJSON, ...rest } = this; return { ...rest }; },
		...overrides,
	};
	return user;
}

const validPayload = {
	full_name: 'Test Mentor',
	email: 'mentor@example.com',
	password: 'Password123!',
	role: 'mentor',
	facility_id: 2,
	created_by: 1,
};

test('admin registration persists thematic_area_id for a mentor and returns it', async (t) => {
	t.after(restore);
	let createdValues;
	authRepository.findUserByEmail = async () => null;
	authRepository.findUserById = async (id) => (id === 1
		? { id: 1, role: 'admin', facility_id: null }
		: fakeUser({
				id: 42,
				thematic_area_id: 5,
				thematicArea: { id: 5, code: 'MNH', name: 'Maternal Health' },
		  }));
	models.Facility.findByPk = async () => ({ id: 2 });
	models.ThematicArea.findByPk = async (id) => (id === 5 ? { id: 5, code: 'MNH', name: 'Maternal Health' } : null);
	models.User.create = async (values) => {
		createdValues = values;
		return fakeUser({ id: 42, ...values });
	};

	const result = await authService.createUserByAdmin({ ...validPayload, thematic_area_id: 5 });
	assert.equal(createdValues.thematic_area_id, 5);
	assert.equal(result.thematic_area_id, 5);
	assert.deepEqual(result.thematic_area, { id: 5, code: 'MNH', name: 'Maternal Health' });
});

test('admin registration without thematic_area_id still works', async (t) => {
	t.after(restore);
	authRepository.findUserByEmail = async () => null;
	authRepository.findUserById = async (id) => (id === 1
		? { id: 1, role: 'admin', facility_id: null }
		: fakeUser({ id: 42, thematic_area_id: null }));
	models.Facility.findByPk = async () => ({ id: 2 });
	models.ThematicArea.findByPk = async () => {
		throw new Error('thematic area lookup should not run');
	};
	models.User.create = async (values) => fakeUser({ id: 42, ...values });

	const result = await authService.createUserByAdmin(validPayload);
	assert.equal(result.thematic_area_id, null);
	assert.equal(result.thematic_area, undefined);
});

test('admin registration rejects thematic_area_id for non-mentor roles', async (t) => {
	t.after(restore);
	authRepository.findUserByEmail = async () => null;
	authRepository.findUserById = async () => ({ id: 1, role: 'admin', facility_id: null });
	models.Facility.findByPk = async () => ({ id: 2 });
	models.User.create = async () => {
		throw new Error('user creation should not be reached');
	};

	await assert.rejects(
		authService.createUserByAdmin({ ...validPayload, role: 'mentee', thematic_area_id: 5 }),
		(error) => error.statusCode === 422 && error.code === 'THEMATIC_AREA_ROLE_RESTRICTED'
	);
});

test('admin registration rejects a nonexistent thematic_area_id', async (t) => {
	t.after(restore);
	authRepository.findUserByEmail = async () => null;
	authRepository.findUserById = async () => ({ id: 1, role: 'admin', facility_id: null });
	models.Facility.findByPk = async () => ({ id: 2 });
	models.ThematicArea.findByPk = async () => null;
	models.User.create = async () => {
		throw new Error('user creation should not be reached');
	};

	await assert.rejects(
		authService.createUserByAdmin({ ...validPayload, thematic_area_id: 999 }),
		(error) => error.statusCode === 404 && error.code === 'THEMATIC_AREA_NOT_FOUND'
	);
});

test('mentor profile update persists a new thematic_area_id', async (t) => {
	t.after(restore);
	const mentor = fakeUser({
		id: 7,
		thematic_area_id: 3,
		thematicArea: { id: 3, code: 'OLD', name: 'Old Area' },
	});
	let lookupCount = 0;
	authRepository.findUserById = async () => {
		lookupCount += 1;
		return lookupCount === 1 ? mentor : fakeUser({
			id: 7,
			role: 'mentor',
			thematic_area_id: 5,
			thematicArea: { id: 5, code: 'MNH', name: 'Maternal Health' },
		});
	};
	models.ThematicArea.findByPk = async (id) => (id === 5 ? { id: 5 } : null);

	const result = await authService.updateUserProfile(7, { thematic_area_id: 5 });
	assert.equal(mentor.thematic_area_id, 5);
	assert.equal(result.thematic_area_id, 5);
	assert.deepEqual(result.thematic_area, { id: 5, code: 'MNH', name: 'Maternal Health' });
});

test('profile update without thematic_area_id preserves the existing selection', async (t) => {
	t.after(restore);
	const mentor = fakeUser({
		id: 7,
		role: 'mentor',
		thematic_area_id: 3,
		full_name: 'Old Name',
		thematicArea: { id: 3, code: 'OLD', name: 'Old Area' },
	});
	let lookupCount = 0;
	authRepository.findUserById = async () => {
		lookupCount += 1;
		return lookupCount === 1 ? mentor : fakeUser({
			id: 7,
			role: 'mentor',
			full_name: 'New Name',
			thematic_area_id: 3,
			thematicArea: { id: 3, code: 'OLD', name: 'Old Area' },
		});
	};

	const result = await authService.updateUserProfile(7, { full_name: 'New Name' });
	assert.equal(mentor.thematic_area_id, 3);
	assert.equal(result.thematic_area_id, 3);
});

test('non-mentor profile update cannot modify thematic_area_id', async (t) => {
	t.after(restore);
	const mentee = fakeUser({ id: 8, role: 'mentee' });
	authRepository.findUserById = async () => mentee;
	models.ThematicArea.findByPk = async () => ({ id: 5 });

	await assert.rejects(
		authService.updateUserProfile(8, { thematic_area_id: 5 }),
		(error) => error.statusCode === 403 && error.code === 'FORBIDDEN'
	);
});

test('profile update rejects a nonexistent thematic_area_id', async (t) => {
	t.after(restore);
	const mentor = fakeUser({ id: 7, role: 'mentor' });
	let lookupCount = 0;
	authRepository.findUserById = async () => {
		lookupCount += 1;
		return lookupCount === 1 ? mentor : fakeUser({ id: 7, role: 'mentor' });
	};
	models.ThematicArea.findByPk = async () => null;

	await assert.rejects(
		authService.updateUserProfile(7, { thematic_area_id: 999 }),
		(error) => error.statusCode === 404 && error.code === 'THEMATIC_AREA_NOT_FOUND'
	);
});

test('mentor profile update can clear thematic_area_id with null', async (t) => {
	t.after(restore);
	const mentor = fakeUser({
		id: 7,
		role: 'mentor',
		thematic_area_id: 3,
	});
	let lookupCount = 0;
	authRepository.findUserById = async () => {
		lookupCount += 1;
		return lookupCount === 1 ? mentor : fakeUser({ id: 7, role: 'mentor', thematic_area_id: null });
	};
	models.ThematicArea.findByPk = async () => {
		throw new Error('thematic area lookup should not run for null');
	};

	const result = await authService.updateUserProfile(7, { thematic_area_id: null });
	assert.equal(mentor.thematic_area_id, null);
	assert.equal(result.thematic_area_id, null);
});
