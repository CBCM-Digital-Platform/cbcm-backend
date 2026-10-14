// src/services/auth.service.js
const { User, RefreshToken, UserPreference, Facility, ActivityLog } = require('../models');
const AppError = require('../errors/app-error');
const authRepository = require('../repositories/auth.repository');
const { hashPassword, comparePassword, hashToken, randomToken } = require('../utils/hash.util');
const { generateAccessToken, generateRefreshTokenValue, getRefreshTokenExpiry, getPasswordResetTokenExpiry, getOtpExpiry } = require('../utils/token.util');
const emailUtil = require('../utils/email.util');
const env = require('../config/env');
const { USER_ROLES, canAssignRole, canAccessUser } = require('../constants/roles.constants');

const USER_SYSTEM_ROLES = new Set(USER_ROLES);
const RESET_MESSAGE = 'If that email exists, a reset link will be sent.';
const OTP_MESSAGE = 'If that email exists, an OTP will be sent.';
const RECOVERY_RATE_LIMIT_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function ensureRecoveryRateLimit(userId) {
  const latest = await authRepository.findLatestPasswordResetTokenForUser(userId);
  if (!latest || !latest.requested_at) return;
  const ageMs = Date.now() - new Date(latest.requested_at).getTime();
  if (ageMs < RECOVERY_RATE_LIMIT_MS) {
    throw new AppError('A recovery code was already sent recently. Please wait a moment and try again.', 429, 'RATE_LIMITED');
  }
}

function sanitizeUser(user) {
  if (!user) return null;
  const plain = user.toJSON ? user.toJSON() : { ...user };
  const fields = [
    'id', 'full_name', 'email', 'phone', 'role', 'facility_id',
    'highest_qualification', 'training_status', 'avatar_url', 'status',
    'must_change_password', 'created_at', 'updated_at',
  ];
  return Object.fromEntries(fields.filter((field) => plain[field] !== undefined).map((field) => [field, plain[field]]));
}

function isUserEligible(user) {
  if (!user) return false;
  const status = String(user.status || '').toLowerCase();
  return status === 'active';
}

async function login({ email, password, deviceInfo }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw new AppError('Email and password are required.', 400, 'VALIDATION_ERROR');
  }

  const user = await authRepository.findUserByEmail(normalizedEmail);
  if (!user || !(await comparePassword(password, user.password_hash))) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  if (!isUserEligible(user)) {
    throw new AppError('Your account is inactive or suspended and cannot sign in.', 401, 'ACCOUNT_INACTIVE');
  }

  const accessToken = generateAccessToken(user);
  const rawRefreshToken = generateRefreshTokenValue();
  const refreshHash = hashToken(rawRefreshToken);
  const expiresAt = getRefreshTokenExpiry();

  const refreshToken = await authRepository.createRefreshTokenEntry({
    userId: user.id,
    tokenHash: refreshHash,
    deviceInfo,
    expiresAt,
  });

  await logActivity({ actorId: user.id, action: 'login', entityId: user.id });

  return {
    accessToken,
    accessTokenExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshToken: rawRefreshToken,
    refreshTokenExpiresAt: expiresAt.toISOString(),
    user: sanitizeUser(user),
    refreshTokenRecord: refreshToken,
  };
}

async function refreshToken({ refreshToken }) {
  if (!refreshToken) {
    throw new AppError('Refresh token is required.', 400, 'VALIDATION_ERROR');
  }

  const tokenHash = hashToken(refreshToken);
  const existingToken = await authRepository.findRefreshTokenByHash(tokenHash);

  if (!existingToken || !existingToken.user) {
    throw new AppError('Refresh token is invalid.', 401, 'INVALID_REFRESH_TOKEN');
  }
  if (existingToken.revoked_at) {
    throw new AppError('Refresh token has already been revoked or used.', 401, 'REFRESH_TOKEN_REVOKED');
  }
  if (new Date(existingToken.expires_at) <= new Date()) {
    throw new AppError('Refresh token has expired.', 401, 'REFRESH_TOKEN_EXPIRED');
  }

  if (!isUserEligible(existingToken.user)) {
    throw new AppError('User is no longer eligible to authenticate.', 401, 'ACCOUNT_INACTIVE');
  }

  const user = existingToken.user;
  const newRefreshTokenValue = generateRefreshTokenValue();
  const newRefreshHash = hashToken(newRefreshTokenValue);
  const expiresAt = getRefreshTokenExpiry();

  const finalToken = await User.sequelize.transaction(async (transaction) => {
    const [consumedCount] = await authRepository.consumeRefreshToken(existingToken.id, transaction);
    if (!consumedCount) {
      throw new AppError('Refresh token has already been revoked or used.', 401, 'REFRESH_TOKEN_REVOKED');
    }
    const newTokenEntry = await authRepository.createRefreshTokenEntry({
      userId: user.id,
      tokenHash: newRefreshHash,
      deviceInfo: existingToken.device_info,
      expiresAt,
    });

    return {
      accessToken: generateAccessToken(user),
      accessTokenExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
      refreshToken: newRefreshTokenValue,
      refreshTokenExpiresAt: expiresAt.toISOString(),
      refreshTokenEntry: newTokenEntry,
      user: sanitizeUser(user),
    };
  });

  return finalToken;
}

async function logout({ user, refreshToken }) {
  if (!user || !user.id) {
    throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  }

  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    const tokenRecord = await RefreshToken.findOne({ where: { user_id: user.id, token_hash: tokenHash } });
    if (tokenRecord && !tokenRecord.revoked_at) {
      await tokenRecord.update({ revoked_at: new Date() });
    }
  } else {
    await authRepository.revokeAllUserRefreshTokens(user.id);
  }

  await logActivity({ actorId: user.id, action: 'logout', entityId: user.id });

  return { revoked: true };
}

async function forgotPassword({ email }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new AppError('Email is required.', 400, 'VALIDATION_ERROR');
  }

  const user = await authRepository.findUserByEmail(normalizedEmail);
  if (!user || !isUserEligible(user)) return { message: RESET_MESSAGE };

  await ensureRecoveryRateLimit(user.id);

  const resetToken = randomToken(32);
  const resetHash = hashToken(resetToken);
  const expiresAt = getPasswordResetTokenExpiry();

  await User.sequelize.transaction(async (transaction) => {
    await authRepository.invalidatePasswordResetTokens(user.id, transaction);
    await authRepository.createPasswordResetTokenEntry({ userId: user.id, tokenHash: resetHash, expiresAt, transaction });
  });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;
  try {
    await emailUtil.sendPasswordResetEmail({ to: user.email, resetUrl });
  } catch {
    // The response remains generic so delivery errors cannot confirm account existence.
  }
  return { message: RESET_MESSAGE };
}

async function forgotOtp({ email }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new AppError('Email is required.', 400, 'VALIDATION_ERROR');
  }

  const user = await authRepository.findUserByEmail(normalizedEmail);
  if (!user || !isUserEligible(user)) return { message: OTP_MESSAGE };

  await ensureRecoveryRateLimit(user.id);

  const otp = generateOtpCode();
  const otpHash = hashToken(otp);
  const expiresAt = getOtpExpiry();

  await User.sequelize.transaction(async (transaction) => {
    await authRepository.invalidatePasswordResetTokens(user.id, transaction);
    await authRepository.createPasswordResetTokenEntry({ userId: user.id, tokenHash: otpHash, expiresAt, transaction });
  });

  try {
    await emailUtil.sendOtpEmail({ to: user.email, otp });
  } catch {
    // Generic response remains consistent even if delivery fails.
  }
  return { message: OTP_MESSAGE };
}

async function resetPassword({ token, password, newPassword, confirmPassword }) {
  const resolvedPassword = typeof newPassword === 'string' ? newPassword : password;
  const resolvedConfirmPassword = typeof confirmPassword === 'string' ? confirmPassword : password;

  if (!token || !resolvedPassword) {
    throw new AppError('Reset token and new password are required.', 400, 'VALIDATION_ERROR');
  }
  if (resolvedConfirmPassword && resolvedPassword !== resolvedConfirmPassword) {
    throw new AppError('Passwords do not match.', 400, 'PASSWORD_MISMATCH');
  }

  const tokenHash = hashToken(token);
  const legacyTokenHash = hashToken(`password_reset:${token}`);
  const resetToken = await authRepository.findPasswordResetTokenByHash([tokenHash, legacyTokenHash]);

  if (!resetToken || !resetToken.user) {
    throw new AppError('Reset token is invalid.', 401, 'INVALID_RESET_TOKEN');
  }
  if (resetToken.used_at) {
    throw new AppError('Reset token has already been used.', 401, 'RESET_TOKEN_USED');
  }
  if (new Date(resetToken.expires_at) <= new Date()) {
    throw new AppError('Reset token has expired.', 401, 'RESET_TOKEN_EXPIRED');
  }
  if (!isUserEligible(resetToken.user)) {
    throw new AppError('Account is inactive and cannot reset its password.', 401, 'ACCOUNT_INACTIVE');
  }
  if (typeof resolvedPassword !== 'string' || resolvedPassword.length < 8) {
    throw new AppError('Password must be at least 8 characters.', 400, 'VALIDATION_ERROR');
  }
  if (await comparePassword(resolvedPassword, resetToken.user.password_hash)) {
    throw new AppError('New password must differ from the current password.', 400, 'PASSWORD_UNCHANGED');
  }

  const newPasswordHash = await hashPassword(resolvedPassword);

  await User.sequelize.transaction(async (transaction) => {
    const [usedCount] = await authRepository.markPasswordResetTokenUsed(resetToken.id, transaction);
    if (!usedCount) throw new AppError('Reset token has already been used.', 401, 'RESET_TOKEN_USED');
    await User.update({ password_hash: newPasswordHash, password_changed_at: new Date(), must_change_password: false }, { where: { id: resetToken.user_id }, transaction });
    await authRepository.revokeAllUserRefreshTokens(resetToken.user_id, transaction);
    await authRepository.invalidatePasswordResetTokens(resetToken.user_id, transaction);
  });

  await logActivity({ actorId: resetToken.user_id, action: 'password_reset', entityId: resetToken.user_id });

  return { reset: true };
}

async function resetOtp({ email, otp, newPassword, confirmPassword }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedOtp = String(otp || '').trim();
  const resolvedPassword = typeof newPassword === 'string' ? newPassword : undefined;
  const resolvedConfirmPassword = typeof confirmPassword === 'string' ? confirmPassword : undefined;

  if (!normalizedEmail || !normalizedOtp || !resolvedPassword || !resolvedConfirmPassword) {
    throw new AppError('Email, OTP, and the new password are required.', 400, 'VALIDATION_ERROR');
  }
  if (resolvedPassword !== resolvedConfirmPassword) {
    throw new AppError('Passwords do not match.', 400, 'PASSWORD_MISMATCH');
  }
  if (!/^\d{6}$/.test(normalizedOtp)) {
    throw new AppError('OTP must be a 6-digit numeric code.', 400, 'VALIDATION_ERROR');
  }

  const user = await authRepository.findUserByEmail(normalizedEmail);
  if (!user || !isUserEligible(user)) {
    throw new AppError('OTP is invalid or expired.', 401, 'INVALID_OTP');
  }

  const otpRecords = await authRepository.findUserPasswordResetTokens(user.id);
  const otpHashes = [hashToken(normalizedOtp), hashToken(`otp:${normalizedOtp}`)];
  const otpRecord = otpRecords.find((record) => otpHashes.includes(record.token_hash));
  if (!otpRecord) {
    const lastRecord = otpRecords[0];
    if (lastRecord && lastRecord.used_at) {
      throw new AppError('OTP has already been used.', 401, 'OTP_USED');
    }
    throw new AppError('OTP is invalid or expired.', 401, 'INVALID_OTP');
  }
  if (otpRecord.used_at) {
    throw new AppError('OTP has already been used.', 401, 'OTP_USED');
  }
  if (new Date(otpRecord.expires_at) <= new Date()) {
    throw new AppError('OTP has expired.', 401, 'OTP_EXPIRED');
  }

  if (otpRecord.failed_attempts >= MAX_OTP_ATTEMPTS) {
    await otpRecord.update({ used_at: new Date() });
    throw new AppError('This OTP has reached its attempt limit. Request a new one.', 401, 'OTP_LOCKED');
  }

  if (typeof resolvedPassword !== 'string' || resolvedPassword.length < 8) {
    throw new AppError('Password must be at least 8 characters.', 400, 'VALIDATION_ERROR');
  }
  if (await comparePassword(resolvedPassword, user.password_hash)) {
    throw new AppError('New password must differ from the current password.', 400, 'PASSWORD_UNCHANGED');
  }

  const newPasswordHash = await hashPassword(resolvedPassword);

  await User.sequelize.transaction(async (transaction) => {
    const [usedCount] = await authRepository.markPasswordResetTokenUsed(otpRecord.id, transaction);
    if (!usedCount) throw new AppError('OTP has already been used.', 401, 'OTP_USED');
    await User.update({ password_hash: newPasswordHash, password_changed_at: new Date(), must_change_password: false }, { where: { id: user.id }, transaction });
    await authRepository.revokeAllUserRefreshTokens(user.id, transaction);
    await authRepository.invalidatePasswordResetTokens(user.id, transaction);
  });

  await logActivity({ actorId: user.id, action: 'password_reset', entityId: user.id });

  return { reset: true };
}

async function changePassword({ user, currentPassword, newPassword }) {
  if (!user || !user.id) {
    throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  }
  if (!currentPassword || !newPassword) {
    throw new AppError('Current and new password are required.', 400, 'VALIDATION_ERROR');
  }

  const currentUser = await authRepository.findUserById(user.id);
  if (!currentUser || !(await comparePassword(currentPassword, currentUser.password_hash))) {
    throw new AppError('Current password is incorrect.', 401, 'INVALID_CURRENT_PASSWORD');
  }

  if (newPassword.length < 8) {
    throw new AppError('New password must be at least 8 characters.', 400, 'VALIDATION_ERROR');
  }
  if (await comparePassword(newPassword, currentUser.password_hash)) {
    throw new AppError('New password must differ from the current password.', 400, 'PASSWORD_UNCHANGED');
  }

  const newHash = await hashPassword(newPassword);
  await User.sequelize.transaction(async (transaction) => {
    await User.update({ password_hash: newHash, password_changed_at: new Date(), must_change_password: false }, { where: { id: user.id }, transaction });
    await authRepository.revokeAllUserRefreshTokens(user.id, transaction);
  });

  await logActivity({ actorId: user.id, action: 'password_change', entityId: user.id });

  return { changed: true };
}

async function getSession(userId) {
  const user = await authRepository.findUserById(userId);
  if (!user) throw new AppError('Session not found.', 401, 'INVALID_SESSION');
  return sanitizeUser(user);
}

async function getUserProfile(userId) {
  const user = await authRepository.findUserById(userId);
  if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
  return sanitizeUser(user);
}

async function updateUserProfile(userId, payload) {
  const user = await authRepository.findUserById(userId);
  if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');

  const updates = {};
  const allowedFields = ['full_name', 'phone', 'highest_qualification', 'training_status', 'avatar_url'];
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      updates[field] = payload[field];
    }
  }

  if (!Object.keys(updates).length) {
    return sanitizeUser(user);
  }

  await user.update(updates);
  return sanitizeUser(await authRepository.findUserById(userId));
}

async function updateUserPreferences(userId, payload) {
  const existing = await authRepository.findUserPreferencesByUserId(userId);
  const updates = {};
  const allowedFields = ['language', 'theme', 'notifications_enabled'];
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) updates[field] = payload[field];
  }
  if (!existing) {
    const created = await UserPreference.create({ user_id: userId, ...updates });
    return created.toJSON();
  }
  await existing.update(updates);
  return existing.reload();
}

async function getUserPreferences(userId) {
  const preferences = await authRepository.findUserPreferencesByUserId(userId);
  return preferences ? preferences.toJSON() : null;
}

async function listUsers({ page = 1, limit = 20, role, status, facilityId }, actor) {
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;

  // Enforce facility scope for Facility Admin
  if (actor && actor.role === 'facility_admin') {
    if (!actor.facility_id) {
      throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
    }
    filter.facility_id = actor.facility_id;
  } else if (facilityId) {
    // System Admin can filter by facility if specified
    filter.facility_id = facilityId;
  }

  const { count, rows } = await User.findAndCountAll({
    where: filter,
    order: [['id', 'ASC']],
    limit: Number(limit),
    offset: (Number(page) - 1) * Number(limit),
    attributes: { exclude: ['password_hash'] },
  });

  return {
    items: rows.map(sanitizeUser),
    total: count,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.max(1, Math.ceil(count / Number(limit))),
  };
}

async function getUserByIdForAdmin(userId, actor) {
  const user = await authRepository.findUserById(userId);
  if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');

  // Enforce facility scope for Facility Admin
  if (actor && actor.role === 'facility_admin' && !canAccessUser(actor, user)) {
    throw new AppError('You do not have permission to access this user.', 403, 'FORBIDDEN');
  }

  return sanitizeUser(user);
}

async function createUserByAdmin(payload) {
  const cleanedRole = String(payload.role || '').trim().toLowerCase();
  if (!USER_SYSTEM_ROLES.has(cleanedRole)) {
    throw new AppError('Unsupported role selected for account creation.', 422, 'INVALID_ROLE');
  }

  const actor = payload.created_by ? await authRepository.findUserById(payload.created_by) : null;
  if (actor && !canAssignRole(actor.role, cleanedRole)) {
    throw new AppError('You do not have permission to create or assign this role.', 403, 'FORBIDDEN');
  }

  if (actor && actor.role === 'facility_admin') {
    const facilityId = payload.facility_id != null ? Number(payload.facility_id) : null;
    if (!facilityId || Number(actor.facility_id) !== facilityId) {
      throw new AppError('Facility administrators can only assign users to their own facility.', 403, 'FORBIDDEN');
    }
    if (cleanedRole === 'facility_admin' || cleanedRole === 'admin') {
      throw new AppError('Facility administrators cannot create or promote another administrator.', 403, 'FORBIDDEN');
    }
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const existing = await authRepository.findUserByEmail(email);
  if (existing) {
    throw new AppError('An account already exists for this email.', 409, 'USER_EXISTS');
  }

  if (payload.facility_id != null && !(await Facility.findByPk(payload.facility_id))) {
    throw new AppError('Facility was not found.', 404, 'FACILITY_NOT_FOUND');
  }

  const password = payload.password;
  if (typeof password !== 'string' || password.length < 8) {
    throw new AppError('A temporary password of at least 8 characters is required.', 400, 'VALIDATION_ERROR');
  }
  const hashed = await hashPassword(password);
  let user;
  try {
    user = await User.create({
      full_name: payload.full_name,
      email,
      phone: payload.phone || null,
      password_hash: hashed,
      role: cleanedRole,
      facility_id: payload.facility_id || null,
      highest_qualification: payload.highest_qualification || null,
      training_status: payload.training_status || null,
      avatar_url: payload.avatar_url || null,
      status: 'active',
      must_change_password: payload.must_change_password !== false,
      password_changed_at: new Date(),
      created_by: payload.created_by || null,
    });
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      throw new AppError('An account already exists for this email.', 409, 'USER_EXISTS');
    }
    throw error;
  }

  await logActivity({ actorId: payload.created_by, action: 'user_provisioned', entityId: user.id });

  return sanitizeUser(user);
}

async function updateUserStatus(userId, status, updatedBy) {
  const user = await authRepository.findUserById(userId);
  if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
  if (!['active', 'inactive', 'suspended'].includes(String(status))) {
    throw new AppError('Unsupported account status.', 422, 'INVALID_STATUS');
  }

  const actor = await authRepository.findUserById(updatedBy);
  if (actor && actor.role === 'facility_admin' && Number(actor.facility_id) !== Number(user.facility_id)) {
    throw new AppError('Facility administrators can only manage users within their own facility.', 403, 'FORBIDDEN');
  }

  if (Number(updatedBy) === Number(userId) && status !== 'active') {
    throw new AppError('Administrators cannot disable their own account.', 409, 'SELF_DEACTIVATION_FORBIDDEN');
  }
  await user.update({
    status,
    updated_by: updatedBy || null,
    ...(status === 'active' ? {} : { password_changed_at: new Date() }),
  });
  if (status !== 'active') await authRepository.revokeAllUserRefreshTokens(user.id);
  await logActivity({ actorId: updatedBy, action: 'user_status_changed', entityId: user.id });
  return sanitizeUser(user);
}

async function logActivity({ actorId = null, action, entityId = null }) {
  try {
    await ActivityLog.create({
      actor_id: actorId,
      action,
      entity_type: 'user',
      entity_id: entityId,
      details: JSON.stringify({}),
    });
  } catch {
    // Audit logging must not turn a successful authentication action into a failure.
  }
}

module.exports = {
  login,
  refreshToken,
  logout,
  forgotPassword,
  forgotOtp,
  resetPassword,
  resetOtp,
  changePassword,
  getSession,
  getUserProfile,
  updateUserProfile,
  updateUserPreferences,
  getUserPreferences,
  listUsers,
  getUserByIdForAdmin,
  createUserByAdmin,
  updateUserStatus,
  sanitizeUser,
  isUserEligible,
};
