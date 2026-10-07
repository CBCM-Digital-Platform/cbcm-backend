const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'facility-cycle-test-access-secret';
process.env.JWT_REFRESH_SECRET = 'facility-cycle-test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.PASSWORD_RESET_EXPIRES_IN = '1h';
process.env.DATABASE_URL = 'sqlite::memory:';

const models = require('../../src/models');
const { generateAccessToken } = require('../../src/utils/token.util');
const { createApp } = require('../../src/app');
const { swaggerSpec } = require('../../src/config/swagger');

const app = createApp();
let adminToken;
let menteeToken;
let admin;
let sequence = 0;

function uniqueValue(prefix) {
  sequence += 1;
  return `${prefix}-${Date.now()}-${sequence}`;
}

async function createTestUser(role, email) {
  const user = await models.User.create({
    full_name: `${role} Test User`,
    email,
    password_hash: 'not-used-by-these-tests',
    role,
    status: 'active',
    must_change_password: false,
    password_changed_at: new Date(),
  });
  return { user, token: generateAccessToken(user) };
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

test.before(async () => {
  await models.sequelize.sync();
  const adminFixture = await createTestUser('admin', 'facilities-admin@example.test');
  admin = adminFixture.user;
  adminToken = adminFixture.token;
  const menteeFixture = await createTestUser('mentee', 'facilities-mentee@example.test');
  menteeToken = menteeFixture.token;
});

test.after(async () => {
  await models.sequelize.close();
});

test('facility, mentorship cycle, and configuration APIs preserve existing auth behavior', async (t) => {
  let facility;
  let cycle;
  let thematicArea;

  await t.test('facility CRUD validates fields and restricts writes to admins', async () => {
    const unauthenticated = await request(app).get('/api/v1/facilities');
    assert.equal(unauthenticated.status, 401);

    const visibleToMentee = await request(app)
      .get('/api/v1/facilities')
      .set(bearer(menteeToken));
    assert.equal(visibleToMentee.status, 200);

    const forbidden = await request(app)
      .post('/api/v1/facilities')
      .set(bearer(menteeToken))
      .send({ name: 'Not allowed', type: 'health_center' });
    assert.equal(forbidden.status, 403);

    const missingRequiredFields = await request(app)
      .post('/api/v1/facilities')
      .set(bearer(adminToken))
      .send({ name: 'Missing type' });
    assert.equal(missingRequiredFields.status, 400);

    const extraField = await request(app)
      .post('/api/v1/facilities')
      .set(bearer(adminToken))
      .send({ name: 'Invalid field', type: 'health_center', status: 'active' });
    assert.equal(extraField.status, 400);

    const created = await request(app)
      .post('/api/v1/facilities')
      .set(bearer(adminToken))
      .send({
        name: uniqueValue('Facility'),
        type: 'health_center',
        level: 'primary',
        region: 'Oromia',
        zone: 'West Shewa',
        woreda: 'Ambo',
        kebele: '01',
        street_address: 'Main road',
        contact_info: '+251911234567',
      });
    assert.equal(created.status, 201);
    facility = created.body.data;
    assert.equal(facility.region, 'Oromia');
    assert.equal(facility.woreda, 'Ambo');
    assert.equal(facility.created_by, undefined);
    assert.equal(facility.status, undefined);

    const fetched = await request(app)
      .get(`/api/v1/facilities/${facility.id}`)
      .set(bearer(menteeToken));
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.id, facility.id);

    const missing = await request(app)
      .get('/api/v1/facilities/999999')
      .set(bearer(adminToken));
    assert.equal(missing.status, 404);

    const filtered = await request(app)
      .get('/api/v1/facilities?region=Oromia&page=1&limit=10')
      .set(bearer(adminToken));
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.data.some((item) => item.id === facility.id));
    assert.equal(filtered.body.meta.page, 1);

    const updated = await request(app)
      .patch(`/api/v1/facilities/${facility.id}`)
      .set(bearer(adminToken))
      .send({ zone: 'Updated Zone' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.zone, 'Updated Zone');

    const invalidUpdate = await request(app)
      .patch(`/api/v1/facilities/${facility.id}`)
      .set(bearer(adminToken))
      .send({ unknown: 'field' });
    assert.equal(invalidUpdate.status, 400);

    const forbiddenUpdate = await request(app)
      .patch(`/api/v1/facilities/${facility.id}`)
      .set(bearer(menteeToken))
      .send({ region: 'Amhara' });
    assert.equal(forbiddenUpdate.status, 403);
  });

  await t.test('cycle CRUD validates dates and enforces lifecycle transitions', async () => {
    const invalidDates = await request(app)
      .post('/api/v1/mentorship-cycles')
      .set(bearer(adminToken))
      .send({ name: 'Invalid dates', start_date: '2027-05-01', end_date: '2027-04-30' });
    assert.equal(invalidDates.status, 400);

    const invalidDateFormat = await request(app)
      .post('/api/v1/mentorship-cycles')
      .set(bearer(adminToken))
      .send({ name: 'Bad date format', start_date: 'not-a-date' });
    assert.equal(invalidDateFormat.status, 400);

    const dateTimeInsteadOfDate = await request(app)
      .post('/api/v1/mentorship-cycles')
      .set(bearer(adminToken))
      .send({ name: 'Date time rejected', start_date: '2026-11-01T00:00:00Z' });
    assert.equal(dateTimeInsteadOfDate.status, 400);

    const created = await request(app)
      .post('/api/v1/mentorship-cycles')
      .set(bearer(adminToken))
      .send({ name: uniqueValue('Cycle'), start_date: '2026-11-01', end_date: '2027-04-30' });
    assert.equal(created.status, 201);
    cycle = created.body.data;
    assert.equal(cycle.status, 'draft');

    const fetched = await request(app)
      .get(`/api/v1/mentorship-cycles/${cycle.id}`)
      .set(bearer(menteeToken));
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.data.name, cycle.name);

    const missing = await request(app)
      .get('/api/v1/mentorship-cycles/999999')
      .set(bearer(adminToken));
    assert.equal(missing.status, 404);

    const listed = await request(app)
      .get('/api/v1/mentorship-cycles?status=draft')
      .set(bearer(adminToken));
    assert.equal(listed.status, 200);
    assert.ok(listed.body.data.some((item) => item.id === cycle.id));

    const updated = await request(app)
      .patch(`/api/v1/mentorship-cycles/${cycle.id}`)
      .set(bearer(adminToken))
      .send({ name: `${cycle.name} updated` });
    assert.equal(updated.status, 200);
    cycle.name = updated.body.data.name;

    const invalidRange = await request(app)
      .patch(`/api/v1/mentorship-cycles/${cycle.id}`)
      .set(bearer(adminToken))
      .send({ start_date: '2027-05-01' });
    assert.equal(invalidRange.status, 400);

    const menteeWrite = await request(app)
      .post('/api/v1/mentorship-cycles')
      .set(bearer(menteeToken))
      .send({ name: 'Forbidden cycle' });
    assert.equal(menteeWrite.status, 403);

    const cycleWithoutDates = await request(app)
      .post('/api/v1/mentorship-cycles')
      .set(bearer(adminToken))
      .send({ name: uniqueValue('Undated cycle') });
    assert.equal(cycleWithoutDates.status, 201);

    const undatedPlanned = await request(app)
      .patch(`/api/v1/mentorship-cycles/${cycleWithoutDates.body.data.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'planned' });
    assert.equal(undatedPlanned.status, 200);

    const activationWithoutDates = await request(app)
      .patch(`/api/v1/mentorship-cycles/${cycleWithoutDates.body.data.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'active' });
    assert.equal(activationWithoutDates.status, 400);
    assert.equal(activationWithoutDates.body.error.code, 'CYCLE_DATES_REQUIRED');

    const unsupportedTransition = await request(app)
      .patch(`/api/v1/mentorship-cycles/${cycle.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'completed' });
    assert.equal(unsupportedTransition.status, 400);
    assert.equal(unsupportedTransition.body.error.code, 'INVALID_STATUS_TRANSITION');

    const planned = await request(app)
      .patch(`/api/v1/mentorship-cycles/${cycle.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'planned' });
    assert.equal(planned.status, 200);

    const active = await request(app)
      .patch(`/api/v1/mentorship-cycles/${cycle.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'active' });
    assert.equal(active.status, 200);

    const terminalReversal = await request(app)
      .patch(`/api/v1/mentorship-cycles/${cycle.id}/status`)
      .set(bearer(adminToken))
      .send({ status: 'draft' });
    assert.equal(terminalReversal.status, 400);
  });

  await t.test('cycle facility and thematic-area configuration uses existing join tables', async () => {
    const missingCycle = await request(app)
      .get('/api/v1/mentorship-cycles/999999/facilities')
      .set(bearer(adminToken));
    assert.equal(missingCycle.status, 404);

    const attachFacility = await request(app)
      .post(`/api/v1/mentorship-cycles/${cycle.id}/facilities`)
      .set(bearer(adminToken))
      .send({ facility_id: facility.id });
    assert.equal(attachFacility.status, 201);

    const listFacilities = await request(app)
      .get(`/api/v1/mentorship-cycles/${cycle.id}/facilities`)
      .set(bearer(menteeToken));
    assert.equal(listFacilities.status, 200);
    assert.equal(listFacilities.body.data[0].id, facility.id);

    const duplicateFacility = await request(app)
      .post(`/api/v1/mentorship-cycles/${cycle.id}/facilities`)
      .set(bearer(adminToken))
      .send({ facility_id: facility.id });
    assert.equal(duplicateFacility.status, 409);

    const missingFacility = await request(app)
      .post(`/api/v1/mentorship-cycles/${cycle.id}/facilities`)
      .set(bearer(adminToken))
      .send({ facility_id: 999999 });
    assert.equal(missingFacility.status, 404);

    const menteeAssignment = await request(app)
      .post(`/api/v1/mentorship-cycles/${cycle.id}/facilities`)
      .set(bearer(menteeToken))
      .send({ facility_id: facility.id });
    assert.equal(menteeAssignment.status, 403);

    const removeFacility = await request(app)
      .delete(`/api/v1/mentorship-cycles/${cycle.id}/facilities/${facility.id}`)
      .set(bearer(adminToken));
    assert.equal(removeFacility.status, 200);

    const missingFacilityAssignment = await request(app)
      .delete(`/api/v1/mentorship-cycles/${cycle.id}/facilities/${facility.id}`)
      .set(bearer(adminToken));
    assert.equal(missingFacilityAssignment.status, 404);

    thematicArea = await models.ThematicArea.create({ code: uniqueValue('TA'), name: 'Maternal health' });
    const missingThematicArea = await request(app)
      .post(`/api/v1/mentorship-cycles/${cycle.id}/thematic-areas`)
      .set(bearer(adminToken))
      .send({ thematic_area_id: 999999 });
    assert.equal(missingThematicArea.status, 404);

    const attachThematicArea = await request(app)
      .post(`/api/v1/mentorship-cycles/${cycle.id}/thematic-areas`)
      .set(bearer(adminToken))
      .send({ thematic_area_id: thematicArea.id });
    assert.equal(attachThematicArea.status, 201);

    const listThematicAreas = await request(app)
      .get(`/api/v1/mentorship-cycles/${cycle.id}/thematic-areas`)
      .set(bearer(adminToken));
    assert.equal(listThematicAreas.status, 200);
    assert.equal(listThematicAreas.body.data[0].id, thematicArea.id);

    const duplicateThematicArea = await request(app)
      .post(`/api/v1/mentorship-cycles/${cycle.id}/thematic-areas`)
      .set(bearer(adminToken))
      .send({ thematic_area_id: thematicArea.id });
    assert.equal(duplicateThematicArea.status, 409);

    const removeThematicArea = await request(app)
      .delete(`/api/v1/mentorship-cycles/${cycle.id}/thematic-areas/${thematicArea.id}`)
      .set(bearer(adminToken));
    assert.equal(removeThematicArea.status, 200);

    const missingThematicAssignment = await request(app)
      .delete(`/api/v1/mentorship-cycles/${cycle.id}/thematic-areas/${thematicArea.id}`)
      .set(bearer(adminToken));
    assert.equal(missingThematicAssignment.status, 404);
  });

  await t.test('user provisioning validates facility references and auth endpoints remain mounted', async () => {
    const validUser = await request(app)
      .post('/api/v1/users')
      .set(bearer(adminToken))
      .send({
        full_name: 'Facility Assigned Mentor',
        email: uniqueValue('mentor') + '@example.test',
        password: 'TemporaryPass1!',
        role: 'mentor',
        facility_id: facility.id,
      });
    assert.equal(validUser.status, 201);
    assert.equal(validUser.body.data.facility_id, facility.id);

    const invalidFacilityUser = await request(app)
      .post('/api/v1/users')
      .set(bearer(adminToken))
      .send({
        full_name: 'Invalid Facility Mentor',
        email: uniqueValue('invalid-mentor') + '@example.test',
        password: 'TemporaryPass1!',
        role: 'mentor',
        facility_id: 999999,
      });
    assert.equal(invalidFacilityUser.status, 404);

    const session = await request(app)
      .get('/api/v1/auth/session')
      .set(bearer(adminToken));
    assert.equal(session.status, 200);
    assert.equal(session.body.data.user.id, admin.id);

    const profile = await request(app)
      .get('/api/v1/users/me')
      .set(bearer(adminToken));
    assert.equal(profile.status, 200);
    assert.equal(profile.body.data.id, admin.id);

    const userList = await request(app)
      .get('/api/v1/users')
      .set(bearer(adminToken));
    assert.equal(userList.status, 200);
  });

  await t.test('Swagger retains auth schemas and documents the new protected endpoints', () => {
    const { schemas } = swaggerSpec.components;
    assert.ok(schemas.LoginRequest);
    assert.ok(schemas.UserProfile);
    assert.ok(schemas.Facility);
    assert.ok(schemas.MentorshipCycle);
    assert.ok(swaggerSpec.paths['/api/v1/facilities'].get);
    assert.ok(swaggerSpec.paths['/api/v1/facilities'].post);
    assert.ok(swaggerSpec.paths['/api/v1/mentorship-cycles/{id}/status'].patch);
    assert.ok(swaggerSpec.paths['/api/v1/mentorship-cycles/{cycleId}/facilities'].post);
    assert.ok(swaggerSpec.paths['/api/v1/mentorship-cycles/{cycleId}/thematic-areas'].post);
    assert.deepEqual(swaggerSpec.paths['/api/v1/facilities'].post.security, [{ bearerAuth: [] }]);

    function assertRefsResolve(value) {
      if (!value || typeof value !== 'object') return;
      if (typeof value.$ref === 'string') {
        const target = value.$ref.split('/').slice(1).reduce((current, part) => current?.[part], swaggerSpec);
        assert.ok(target, `Unresolved Swagger reference: ${value.$ref}`);
      }
      for (const child of Object.values(value)) assertRefsResolve(child);
    }

    assertRefsResolve(swaggerSpec);
  });
});