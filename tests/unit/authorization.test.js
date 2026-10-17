// tests/unit/authorization.test.js
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const env = require('../../src/config/env');

// Helper to generate a test token
function generateTestToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      facility_id: user.facility_id,
      token_use: 'access',
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
  );
}

// Helper to make test requests
async function makeRequest(method, path, token, body = null) {
  const url = `http://localhost:5000${path}`;
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();
  return { status: response.status, data };
}

describe('Authorization Tests', () => {
  let systemAdminToken;
  let facilityAdminToken;
  let mentorToken;
  let menteeToken;
  let testFacilityId;
  let testUserId;

  before(async () => {
    // Setup: Create test users
    // In a real scenario, these would be created via API or database seeding
    // For now, we'll assume these exist or create them programmatically
    const systemAdmin = { id: 1, email: 'admin@cbcm.org', role: 'admin', facility_id: null };
    const facilityAdmin = { id: 2, email: 'facility_admin@test.org', role: 'facility_admin', facility_id: 1 };
    const mentor = { id: 3, email: 'mentor@test.org', role: 'mentor', facility_id: 1 };
    const mentee = { id: 4, email: 'mentee@test.org', role: 'mentee', facility_id: 1 };

    systemAdminToken = generateTestToken(systemAdmin);
    facilityAdminToken = generateTestToken(facilityAdmin);
    mentorToken = generateTestToken(mentor);
    menteeToken = generateTestToken(mentee);

    testFacilityId = 1;
    testUserId = 5; // Assume a test user exists
  });

  describe('User Creation', () => {
    it('System Admin can create a mentor', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/users',
        systemAdminToken,
        {
          full_name: 'Test Mentor',
          email: 'newmentor@test.org',
          password: 'TestPassword123',
          role: 'mentor',
          facility_id: testFacilityId,
        }
      );
      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.data.success, true);
    });

    it('System Admin can create a mentee', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/users',
        systemAdminToken,
        {
          full_name: 'Test Mentee',
          email: 'newmentee@test.org',
          password: 'TestPassword123',
          role: 'mentee',
          facility_id: testFacilityId,
        }
      );
      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.data.success, true);
    });

    it('System Admin can create a Facility Admin', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/users',
        systemAdminToken,
        {
          full_name: 'Test Facility Admin',
          email: 'newfacilityadmin@test.org',
          password: 'TestPassword123',
          role: 'facility_admin',
          facility_id: testFacilityId,
        }
      );
      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.data.success, true);
    });

    it('Facility Admin can create a mentor within their scope', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/users',
        facilityAdminToken,
        {
          full_name: 'Facility Mentor',
          email: 'facilitymentor@test.org',
          password: 'TestPassword123',
          role: 'mentor',
          facility_id: testFacilityId,
        }
      );
      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.data.success, true);
    });

    it('Facility Admin can create a mentee within their scope', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/users',
        facilityAdminToken,
        {
          full_name: 'Facility Mentee',
          email: 'facilitymentee@test.org',
          password: 'TestPassword123',
          role: 'mentee',
          facility_id: testFacilityId,
        }
      );
      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.data.success, true);
    });

    it('Facility Admin cannot create a Facility Admin (403)', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/users',
        facilityAdminToken,
        {
          full_name: 'Unauthorized Admin',
          email: 'unauthorized@test.org',
          password: 'TestPassword123',
          role: 'facility_admin',
          facility_id: testFacilityId,
        }
      );
      assert.strictEqual(response.status, 403);
      assert.strictEqual(response.data.success, false);
      assert.strictEqual(response.data.error.code, 'FORBIDDEN');
    });

    it('Facility Admin cannot create a System Admin (403)', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/users',
        facilityAdminToken,
        {
          full_name: 'Unauthorized System Admin',
          email: 'unauthorizedsys@test.org',
          password: 'TestPassword123',
          role: 'admin',
          facility_id: testFacilityId,
        }
      );
      assert.strictEqual(response.status, 403);
      assert.strictEqual(response.data.success, false);
      assert.strictEqual(response.data.error.code, 'FORBIDDEN');
    });

    it('Mentor cannot create users (403)', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/users',
        mentorToken,
        {
          full_name: 'Unauthorized User',
          email: 'unauthorized2@test.org',
          password: 'TestPassword123',
          role: 'mentee',
          facility_id: testFacilityId,
        }
      );
      assert.strictEqual(response.status, 403);
      assert.strictEqual(response.data.success, false);
    });

    it('Mentee cannot create users (403)', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/users',
        menteeToken,
        {
          full_name: 'Unauthorized User',
          email: 'unauthorized3@test.org',
          password: 'TestPassword123',
          role: 'mentor',
          facility_id: testFacilityId,
        }
      );
      assert.strictEqual(response.status, 403);
      assert.strictEqual(response.data.success, false);
    });
  });

  describe('Privilege Escalation', () => {
    it('Facility Admin cannot promote themselves (403)', async () => {
      const response = await makeRequest(
        'PATCH',
        '/api/v1/users/2',
        facilityAdminToken,
        { role: 'admin' }
      );
      // This should fail because role is not in allowed fields for update
      assert(response.status === 400 || response.status === 403);
    });

    it('Facility Admin cannot promote another user (403)', async () => {
      const response = await makeRequest(
        'PATCH',
        '/api/v1/users/3',
        facilityAdminToken,
        { role: 'admin' }
      );
      // This should fail because role is not in allowed fields for update
      assert(response.status === 400 || response.status === 403);
    });
  });

  describe('Facility Scope', () => {
    it('System Admin can list all users', async () => {
      const response = await makeRequest('GET', '/api/v1/users', systemAdminToken);
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.data.success, true);
    });

    it('Facility Admin can list users within their facility', async () => {
      const response = await makeRequest('GET', '/api/v1/users', facilityAdminToken);
      assert.strictEqual(response.status, 200);
      assert.strictEqual(response.data.success, true);
    });

    it('Facility Admin cannot access users outside their facility (403)', async () => {
      // Assume user ID 99 belongs to a different facility
      const response = await makeRequest('GET', '/api/v1/users/99', facilityAdminToken);
      assert.strictEqual(response.status, 403);
      assert.strictEqual(response.data.success, false);
    });

    it('System Admin can access any user', async () => {
      const response = await makeRequest('GET', '/api/v1/users/99', systemAdminToken);
      // Should return 404 if user doesn't exist, or 200 if they do
      // But not 403 for permission
      assert(response.status !== 403);
    });
  });

  describe('Cycle Management', () => {
    it('System Admin can create a cycle', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/mentorship-cycles',
        systemAdminToken,
        {
          name: 'Test Cycle',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
        }
      );
      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.data.success, true);
    });

    it('Facility Admin can create a cycle', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/mentorship-cycles',
        facilityAdminToken,
        {
          name: 'Facility Test Cycle',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
        }
      );
      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.data.success, true);
    });

    it('Mentor cannot create a cycle (403)', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/mentorship-cycles',
        mentorToken,
        {
          name: 'Unauthorized Cycle',
          start_date: '2026-01-01',
          end_date: '2026-12-31',
        }
      );
      assert.strictEqual(response.status, 403);
      assert.strictEqual(response.data.success, false);
    });
  });

  describe('Facility Management', () => {
    it('System Admin can create a facility', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/facilities',
        systemAdminToken,
        {
          name: 'Test Facility',
          type: 'hospital',
          level: 'primary',
        }
      );
      assert.strictEqual(response.status, 201);
      assert.strictEqual(response.data.success, true);
    });

    it('Facility Admin cannot create a facility (403)', async () => {
      const response = await makeRequest(
        'POST',
        '/api/v1/facilities',
        facilityAdminToken,
        {
          name: 'Unauthorized Facility',
          type: 'hospital',
          level: 'primary',
        }
      );
      assert.strictEqual(response.status, 403);
      assert.strictEqual(response.data.success, false);
    });
  });
});
