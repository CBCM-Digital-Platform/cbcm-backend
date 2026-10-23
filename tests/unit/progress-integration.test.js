// tests/unit/progress-integration.test.js
process.env.JWT_SECRET = 'progress-integration-test-secret';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/cbcm_test';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const progressService = require('../../src/services/progress.service');
const repository = require('../../src/repositories/progress.repository');
const models = require('../../src/models');

test('createSnapshotFromAssessment creates snapshot with correct data', async () => {
	const originals = {
		findOne: repository.findOne,
		create: repository.create,
	};

	const mockAssessment = {
		id: 123,
		mentee_id: 1,
		facility_id: 5,
		cycle_id: 10,
		thematic_area_id: 15,
		aggregate_score: 85.5,
		finalized_at: new Date(),
	};

	const mockActor = { id: 2, role: 'mentor' };

	// No existing snapshot
	repository.findOne = async () => null;
	repository.create = async (data) => ({ id: 999, ...data });

	try {
		const result = await progressService.createSnapshotFromAssessment(mockAssessment, mockActor);
		assert.strictEqual(result.mentee_id, 1);
		assert.strictEqual(result.facility_id, 5);
		assert.strictEqual(result.cycle_id, 10);
		assert.strictEqual(result.thematic_area_id, 15);
		assert.strictEqual(result.score, 85.5);
		assert.strictEqual(result.triggered_by, 2);
		assert.strictEqual(result.competency_level, null); // Business rule not defined
	} finally {
		repository.findOne = originals.findOne;
		repository.create = originals.create;
	}
});

test('createSnapshotFromAssessment returns existing snapshot for idempotency', async () => {
	const originals = {
		findOne: repository.findOne,
		create: repository.create,
	};

	const now = new Date();
	const mockAssessment = {
		id: 123,
		mentee_id: 1,
		facility_id: 5,
		cycle_id: 10,
		thematic_area_id: 15,
		aggregate_score: 85.5,
		finalized_at: now,
	};

	const mockActor = { id: 2, role: 'mentor' };

	// Existing snapshot within 1 minute
	const existingSnapshot = {
		id: 888,
		mentee_id: 1,
		facility_id: 5,
		cycle_id: 10,
		thematic_area_id: 15,
		score: 85.5,
		competency_level: null,
		triggered_by: 2,
		recorded_at: new Date(now.getTime() - 30000), // 30 seconds ago
	};

	let createCalled = false;
	repository.findOne = async () => existingSnapshot;
	repository.create = async () => { createCalled = true; throw new Error('Should not create duplicate'); };

	try {
		const result = await progressService.createSnapshotFromAssessment(mockAssessment, mockActor);
		assert.strictEqual(result.id, 888); // Returns existing snapshot
		assert.strictEqual(createCalled, false); // create was not called
	} finally {
		repository.findOne = originals.findOne;
		repository.create = originals.create;
	}
});

test('createSnapshotFromAssessment creates new snapshot if existing is old', async () => {
	const originals = {
		findOne: repository.findOne,
		create: repository.create,
	};

	const now = new Date();
	const mockAssessment = {
		id: 123,
		mentee_id: 1,
		facility_id: 5,
		cycle_id: 10,
		thematic_area_id: 15,
		aggregate_score: 85.5,
		finalized_at: now,
	};

	const mockActor = { id: 2, role: 'mentor' };

	// Existing snapshot older than 1 minute
	const existingSnapshot = {
		id: 888,
		mentee_id: 1,
		facility_id: 5,
		cycle_id: 10,
		thematic_area_id: 15,
		score: 75.0,
		competency_level: null,
		triggered_by: 2,
		recorded_at: new Date(now.getTime() - 120000), // 2 minutes ago
	};

	repository.findOne = async () => existingSnapshot;
	repository.create = async (data) => ({ id: 999, ...data });

	try {
		const result = await progressService.createSnapshotFromAssessment(mockAssessment, mockActor);
		assert.strictEqual(result.id, 999); // Creates new snapshot
		assert.strictEqual(result.score, 85.5); // New score
	} finally {
		repository.findOne = originals.findOne;
		repository.create = originals.create;
	}
});
