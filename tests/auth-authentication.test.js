const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { hashToken } = require('../src/utils/hash.util');

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';
process.env.DATABASE_URL = 'sqlite::memory:';
process.env.PASSWORD_RESET_EXPIRES_IN = '1h';

const models = require('../src/models');
const emailUtil = require('../src/utils/email.util');
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

test.before(async () => {
  await models.sequelize.sync();
});

test.beforeEach(async () => {
  await models.PasswordResetToken.destroy({ where: {} });
  await models.RefreshToken.destroy({ where: {} });
  await models.UserPreference.destroy({ where: {} });
  await models.ActivityLog.destroy({ where: {} });
  await models.User.destroy({ where: {} });
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
  const originalEmailSender = emailUtil.sendPasswordResetEmail;
  let resetUrl;
  emailUtil.sendPasswordResetEmail = async ({ resetUrl: url }) => {
    resetUrl = url;
  };

  try {
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'known@example.com' });

    assert.equal(forgot.status, 200);
    assert.equal(forgot.body.success, true);
    assert.equal(forgot.body.data.resetToken, undefined);

    const unknown = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'missing@example.com' });

    assert.equal(unknown.status, 200);
    assert.deepEqual(unknown.body, forgot.body);

    const resetToken = new URL(resetUrl).searchParams.get('token');
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: resetToken, password: 'NewStrongPass2!' });

    assert.equal(reset.status, 200);
    assert.equal(reset.body.success, true);

    const updatedUser = await models.User.findOne({ where: { email: 'known@example.com' }, raw: true });
    assert.notEqual(updatedUser.password_hash, 'NewStrongPass2!');
  } finally {
    emailUtil.sendPasswordResetEmail = originalEmailSender;
  }
});

test('password recovery endpoints respond when email delivery stalls', async () => {
  await createUser({ email: 'stalled-link@example.com' });
  await createUser({ email: 'stalled-otp@example.com' });
  const app = createApp();
  const originalEmailSender = emailUtil.sendPasswordResetEmail;
  const originalOtpSender = emailUtil.sendOtpEmail;
  let deliveryAttempts = 0;
  const stalledSender = () => {
    deliveryAttempts += 1;
    return new Promise(() => {});
  };
  emailUtil.sendPasswordResetEmail = stalledSender;
  emailUtil.sendOtpEmail = stalledSender;

  try {
    const forgotPassword = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'stalled-link@example.com' });
    const forgotOtp = await request(app)
      .post('/api/v1/auth/forgot-otp')
      .send({ email: 'stalled-otp@example.com' });

    assert.equal(forgotPassword.status, 200);
    assert.equal(forgotOtp.status, 200);
    assert.equal(deliveryAttempts, 2);
  } finally {
    emailUtil.sendPasswordResetEmail = originalEmailSender;
    emailUtil.sendOtpEmail = originalOtpSender;
  }
});

test('OTP recovery flow issues a six-digit code, resets password, and rejects reuse', async () => {
  await createUser({ email: 'otp-user@example.com' });
  const app = createApp();
  const originalOtpSender = emailUtil.sendOtpEmail;
  let sentOtp;
  emailUtil.sendOtpEmail = async ({ otp }) => {
    sentOtp = otp;
  };

  try {
    const requestOtp = await request(app)
      .post('/api/v1/auth/forgot-otp')
      .send({ email: 'otp-user@example.com' });

    assert.equal(requestOtp.status, 200);
    assert.equal(requestOtp.body.success, true);
    assert.equal(/^[0-9]{6}$/.test(sentOtp), true);

    const resetOtp = await request(app)
      .post('/api/v1/auth/reset-otp')
      .send({ email: 'otp-user@example.com', otp: sentOtp, new_password: 'NewStrongPass3!', confirm_password: 'NewStrongPass3!' });

    assert.equal(resetOtp.status, 200);
    assert.equal(resetOtp.body.success, true);

    const secondAttempt = await request(app)
      .post('/api/v1/auth/reset-otp')
      .send({ email: 'otp-user@example.com', otp: sentOtp, new_password: 'AnotherStrong4!', confirm_password: 'AnotherStrong4!' });

    assert.equal(secondAttempt.status, 401);
    assert.equal(secondAttempt.body.error.code, 'OTP_USED');

    const loginAfterReset = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'otp-user@example.com', password: 'NewStrongPass3!' });

    assert.equal(loginAfterReset.status, 200);
    assert.equal(loginAfterReset.body.success, true);
  } finally {
    emailUtil.sendOtpEmail = originalOtpSender;
  }
});

test('password reset link flow accepts the new field names and preserves existing auth path', async () => {
  await createUser({ email: 'reset-link@example.com' });
  const app = createApp();
  const originalEmailSender = emailUtil.sendPasswordResetEmail;
  let resetUrl;
  emailUtil.sendPasswordResetEmail = async ({ resetUrl: url }) => {
    resetUrl = url;
  };

  try {
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'reset-link@example.com' });
    assert.equal(forgot.status, 200);

    const token = new URL(resetUrl).searchParams.get('token');
    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token, new_password: 'NewStrongPass4!', confirm_password: 'NewStrongPass4!' });

    assert.equal(reset.status, 200);
    assert.equal(reset.body.success, true);

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'reset-link@example.com', password: 'NewStrongPass4!' });
    assert.equal(login.status, 200);
  } finally {
    emailUtil.sendPasswordResetEmail = originalEmailSender;
  }
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

test('login rejects wrong and nonexistent credentials with the same safe response', async () => {
  await createUser({ email: 'credential-check@example.com' });
  const app = createApp();

  const wrongPassword = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'credential-check@example.com', password: 'WrongPass1!' });
  const unknownEmail = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'unknown@example.com', password: 'WrongPass1!' });

  assert.equal(wrongPassword.status, 401);
  assert.deepEqual(unknownEmail.body, wrongPassword.body);
  assert.equal(wrongPassword.body.error.code, 'INVALID_CREDENTIALS');
});

test('session accepts valid access token and rejects missing, invalid, and expired tokens', async () => {
  const user = await createUser({ email: 'session@example.com' });
  const app = createApp();
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'session@example.com', password: 'StrongPass1!' });

  const valid = await request(app)
    .get('/api/v1/auth/session')
    .set('Authorization', `Bearer ${login.body.data.accessToken}`);
  const refreshAsAccessToken = await request(app)
    .get('/api/v1/auth/session')
    .set('Authorization', `Bearer ${login.body.data.refreshToken}`);
  const missing = await request(app).get('/api/v1/auth/session');
  const invalid = await request(app)
    .get('/api/v1/auth/session')
    .set('Authorization', 'Bearer not-a-jwt');
  const expiredToken = jwt.sign(
    { sub: user.id, token_use: 'access', password_version: 0 },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: -1 }
  );
  const expired = await request(app)
    .get('/api/v1/auth/session')
    .set('Authorization', `Bearer ${expiredToken}`);

  assert.equal(valid.status, 200);
  assert.equal(valid.body.data.user.id, user.id);
  assert.equal(login.body.data.accessTokenExpiresIn, '15m');
  assert.ok(login.body.data.refreshTokenExpiresAt);
  assert.equal(missing.status, 401);
  assert.equal(refreshAsAccessToken.status, 401);
  assert.equal(refreshAsAccessToken.body.error.code, 'INVALID_TOKEN');
  assert.equal(invalid.status, 401);
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error.code, 'TOKEN_EXPIRED');
});

test('logout revokes a refresh token and the token cannot be refreshed afterward', async () => {
  await createUser({ email: 'logout@example.com' });
  const app = createApp();
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'logout@example.com', password: 'StrongPass1!' });
  const accessToken = login.body.data.accessToken;
  const refreshToken = login.body.data.refreshToken;

  const logout = await request(app)
    .post('/api/v1/auth/logout')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ refreshToken });
  const refresh = await request(app)
    .post('/api/v1/auth/refresh-token')
    .send({ refreshToken });

  assert.equal(logout.status, 200);
  assert.equal(logout.body.data.revoked, true);
  assert.equal(refresh.status, 401);
});

test('password change verifies current password, updates hash, and revokes old sessions', async () => {
  await createUser({ email: 'change-password@example.com' });
  const app = createApp();
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'change-password@example.com', password: 'StrongPass1!' });
  const accessToken = login.body.data.accessToken;

  const wrongCurrent = await request(app)
    .post('/api/v1/auth/change-password')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ currentPassword: 'WrongPass1!', newPassword: 'NewStrongPass2!' });
  assert.equal(wrongCurrent.status, 401);
  assert.equal(wrongCurrent.body.error.code, 'INVALID_CURRENT_PASSWORD');

  const changed = await request(app)
    .post('/api/v1/auth/change-password')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ currentPassword: 'StrongPass1!', newPassword: 'NewStrongPass2!' });
  const staleSession = await request(app)
    .get('/api/v1/auth/session')
    .set('Authorization', `Bearer ${accessToken}`);
  const oldLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'change-password@example.com', password: 'StrongPass1!' });
  const newLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'change-password@example.com', password: 'NewStrongPass2!' });

  assert.equal(changed.status, 200);
  assert.equal(changed.body.data.changed, true);
  assert.equal(staleSession.status, 401);
  assert.equal(oldLogin.status, 401);
  assert.equal(newLogin.status, 200);
});

test('password reset tokens expire and are single-use', async () => {
  const user = await createUser({ email: 'expired-reset@example.com' });
  const expiredValue = 'a'.repeat(64);
  await models.PasswordResetToken.create({
    user_id: user.id,
    token_hash: hashToken(expiredValue),
    requested_at: new Date(Date.now() - 3600000),
    expires_at: new Date(Date.now() - 1000),
    used_at: null,
  });
  const app = createApp();

  const expired = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ token: expiredValue, password: 'NewStrongPass2!' });
  assert.equal(expired.status, 401);
  assert.equal(expired.body.error.code, 'RESET_TOKEN_EXPIRED');

  const tokenValue = 'b'.repeat(64);
  await models.PasswordResetToken.create({
    user_id: user.id,
    token_hash: hashToken(tokenValue),
    requested_at: new Date(),
    expires_at: new Date(Date.now() + 3600000),
    used_at: null,
  });
  const reset = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ token: tokenValue, password: 'NewStrongPass2!' });
  const reused = await request(app)
    .post('/api/v1/auth/reset-password')
    .send({ token: tokenValue, password: 'AnotherStrong3!' });

  assert.equal(reset.status, 200);
  assert.equal(reused.status, 401);
  assert.equal(reused.body.error.code, 'RESET_TOKEN_USED');
});

test('users can read and update only editable profile and preference fields', async () => {
  const user = await createUser({ email: 'profile@example.com' });
  const app = createApp();
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'profile@example.com', password: 'StrongPass1!' });
  const accessToken = login.body.data.accessToken;

  const profile = await request(app)
    .get('/api/v1/users/me')
    .set('Authorization', `Bearer ${accessToken}`);
  const profileUpdate = await request(app)
    .patch('/api/v1/users/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ full_name: 'Updated Name' });
  const forbiddenUpdate = await request(app)
    .patch('/api/v1/users/me')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ role: 'admin', status: 'active' });
  const preferenceUpdate = await request(app)
    .patch('/api/v1/users/me/preferences')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ language: 'en', theme: 'dark', notifications_enabled: false });
  const preferences = await request(app)
    .get('/api/v1/users/me/preferences')
    .set('Authorization', `Bearer ${accessToken}`);
  const otherUserPreferences = await request(app)
    .patch('/api/v1/users/me/preferences')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ user_id: user.id + 1, language: 'fr' });
  const storedUser = await models.User.findByPk(user.id);

  assert.equal(profile.status, 200);
  assert.equal(profile.body.data.password_hash, undefined);
  assert.equal(profileUpdate.status, 200);
  assert.equal(profileUpdate.body.data.full_name, 'Updated Name');
  assert.equal(forbiddenUpdate.status, 400);
  assert.equal(storedUser.role, 'mentee');
  assert.equal(preferenceUpdate.status, 200);
  assert.equal(preferences.body.data.language, 'en');
  assert.equal(otherUserPreferences.status, 400);
  assert.equal(await models.UserPreference.count({ where: { user_id: user.id + 1 } }), 0);
});

test('administrator can provision safe user accounts and manage status', async () => {
  await createUser({ email: 'admin@example.com', role: 'admin' });
  const app = createApp();
  const adminLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'admin@example.com', password: 'StrongPass1!' });
  const adminToken = adminLogin.body.data.accessToken;
  const headers = { Authorization: `Bearer ${adminToken}` };
  const created = await request(app)
    .post('/api/v1/users')
    .set(headers)
    .send({
      full_name: 'Provisioned User',
      email: 'provisioned@example.com',
      password: 'TemporaryPass1!',
      role: 'mentee',
    });

  assert.equal(created.status, 201);
  assert.equal(created.body.data.password_hash, undefined);
  assert.equal(created.body.data.must_change_password, true);
  assert.equal(created.body.data.status, 'active');

  const duplicate = await request(app)
    .post('/api/v1/users')
    .set(headers)
    .send({
      full_name: 'Duplicate User',
      email: 'provisioned@example.com',
      password: 'TemporaryPass1!',
      role: 'mentee',
    });
  const list = await request(app).get('/api/v1/users').set(headers);
  const detail = await request(app).get(`/api/v1/users/${created.body.data.id}`).set(headers);
  const provisionedLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'provisioned@example.com', password: 'TemporaryPass1!' });
  const forcedProfile = await request(app)
    .get('/api/v1/users/me')
    .set('Authorization', `Bearer ${provisionedLogin.body.data.accessToken}`);
  const statusChange = await request(app)
    .patch(`/api/v1/users/${created.body.data.id}/status`)
    .set(headers)
    .send({ status: 'inactive' });
  const invalidatedSession = await request(app)
    .get('/api/v1/auth/session')
    .set('Authorization', `Bearer ${provisionedLogin.body.data.accessToken}`);

  assert.equal(duplicate.status, 409);
  assert.equal(list.status, 200);
  assert.equal(list.body.data.every((entry) => entry.password_hash === undefined), true);
  assert.equal(detail.status, 200);
  assert.equal(statusChange.status, 200);
  assert.equal(invalidatedSession.status, 401);
  assert.equal(invalidatedSession.body.error.code, 'ACCOUNT_INACTIVE');
  assert.equal(forcedProfile.status, 403);
  assert.equal(forcedProfile.body.error.code, 'PASSWORD_CHANGE_REQUIRED');
});

test('non-admin cannot provision users and public registration is unavailable', async () => {
  const user = await createUser({ email: 'ordinary@example.com' });
  const app = createApp();
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ordinary@example.com', password: 'StrongPass1!' });
  const headers = { Authorization: `Bearer ${login.body.data.accessToken}` };
  const forbidden = await request(app)
    .post('/api/v1/users')
    .set(headers)
    .send({ full_name: 'Escalation', email: 'escalation@example.com', password: 'TemporaryPass1!', role: 'admin' });
  const publicRegistration = await request(app)
    .post('/api/v1/auth/register')
    .send({ full_name: 'Public', email: 'public@example.com', password: 'StrongPass1!' });

  assert.equal(forbidden.status, 403);
  assert.equal(publicRegistration.status, 404);
  assert.equal(await models.User.count({ where: { email: 'escalation@example.com' } }), 0);
  assert.equal(await models.User.count({ where: { email: 'public@example.com' } }), 0);
  assert.equal(user.role, 'mentee');
});
