const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.PASSWORD_RESET_EXPIRES_IN = '1h';

const models = require('../src/models');
const { createApp } = require('../src/app');

async function createUser(overrides = {}) {
  const passwordHash = overrides.password_hash || (await bcrypt.hash('StrongPass1!', 12));
  return models.User.create({
    full_name: 'Test User',
    email: 'user@example.com',
    phone: '123456789',
    password_hash: passwordHash,
    role: 'mentee',
    status: 'active',
    must_change_password: false,
    ...overrides,
    password_hash: overrides.password_hash || passwordHash,
  });
}

test.beforeEach(async () => {
  await models.sequelize.sync({ force: true });
});

test('login succeeds for active user and returns safe profile', async () => {
  const user = await createUser({ email: 'login@example.com' });
  const app = createApp();

  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'login@example.com', password: 'StrongPass1!' });

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.ok(response.body.data.accessToken);
  assert.ok(response.body.data.refreshToken);
  assert.equal(response.body.data.user.email, 'login@example.com');
  assert.equal(response.body.data.user.password_hash, undefined);
  assert.equal(response.body.data.user.role, 'mentee');

  const dbUser = await models.User.findByPk(user.id, { raw: true });
  assert.ok(dbUser);
  assert.notEqual(dbUser.password_hash, 'StrongPass1!');
});

test('login rejects inactive user', async () => {
  await createUser({ email: 'inactive@example.com', status: 'suspended' });
  const app = createApp();

  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'inactive@example.com', password: 'StrongPass1!' });

  assert.equal(response.status, 401);
  assert.equal(response.body.success, false);
  assert.match(response.body.error.message, /inactive|suspended/i);
});

test('refresh token rotates and rejects reuse after rotation', async () => {
  const user = await createUser({ email: 'refresh@example.com' });
  const app = createApp();

  const loginResult = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'refresh@example.com', password: 'StrongPass1!' });

  const refreshToken = loginResult.body.data.refreshToken;

  const firstRefresh = await request(app)
    .post('/api/v1/auth/refresh-token')
    .send({ refreshToken });

  assert.equal(firstRefresh.status, 200);
  assert.ok(firstRefresh.body.data.accessToken);
  assert.ok(firstRefresh.body.data.refreshToken);
  assert.notEqual(firstRefresh.body.data.refreshToken, refreshToken);

  const reusedRefresh = await request(app)
    .post('/api/v1/auth/refresh-token')
    .send({ refreshToken });

  assert.equal(reusedRefresh.status, 401);
  assert.equal(reusedRefresh.body.success, false);

  const tokens = await models.RefreshToken.findAll({ where: { user_id: user.id } });
  assert.equal(tokens.length, 2);
  assert.equal(tokens.filter((entry) => entry.revoked_at).length, 1);
});

test('forgot password request handles unknown email safely and reset token can be used', async () => {
  await createUser({ email: 'known@example.com' });
  const app = createApp();

  const forgot = await request(app)
    .post('/api/v1/auth/forgot-password')
    .send({ email: 'known@example.com' });

  assert.equal(forgot.status, 200);
  assert.equal(forgot.body.success, true);
  assert.ok(forgot.body.data.resetToken);

  const unknown = await request(app)
    .post('/api/v1/auth/forgot-password')
    .send({ email: 'missing@example.com' });

  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.success, true);

  const resetToken = forgot.body.data.resetToken;
  const reset = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ token: resetToken, password: 'NewStrongPass2!' });

  assert.equal(reset.status, 200);
  assert.equal(reset.body.success, true);

  const updatedUser = await models.User.findByPk(1, { raw: true });
  assert.notEqual(updatedUser.password_hash, 'NewStrongPass2!');
});

test('user listing is forbidden for non-admins', async () => {
  const user = await createUser({ email: 'member@example.com', role: 'mentee' });
  const app = createApp();

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'member@example.com', password: 'StrongPass1!' });

  const response = await request(app)
    .get('/api/v1/users')
    .set('Authorization', `Bearer ${login.body.data.accessToken}`);

  assert.equal(response.status, 403);
  assert.equal(response.body.success, false);
  assert.equal(response.body.error.code, 'FORBIDDEN');
  assert.ok(response.body.error.message);

  const userResponse = await request(app)
    .get(`/api/v1/users/${user.id}`)
    .set('Authorization', `Bearer ${login.body.data.accessToken}`);

  assert.equal(userResponse.status, 403);
});
