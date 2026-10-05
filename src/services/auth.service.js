// src/services/auth.service.js
const { Op } = require('sequelize');
const { User, RefreshToken, PasswordResetToken, UserPreference } = require('../models');
const AppError = require('../errors/app-error');
const authRepository = require('../repositories/auth.repository');
const { hashPassword, comparePassword, hashToken, randomToken } = require('../utils/hash.util');
const { generateAccessToken, generateRefreshTokenValue, getRefreshTokenExpiry } = require('../utils/token.util');
const env = require('../config/env');

const USER_SYSTEM_ROLES = new Set(['admin', 'mentor', 'mentee', 'facility_admin']);

function sanitizeUser(user) {
  if (!user) return null;
  const plain = user.toJSON ? user.toJSON() : { ...user };
  const { password_hash, ...safeUser } = plain;
  return safeUser;
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

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    user: sanitizeUser(user),
    refreshTokenRecord: refreshToken,
  };
}

async function refreshToken({ refreshToken }) {
  if (!refreshToken) {
    throw new AppError('Refresh token is required.', 400, 'VALIDATION_ERROR');
  }

  const tokenHash = hashToken(refreshToken);
  const existingToken = await authRepository.findValidRefreshToken(tokenHash);

  if (!existingToken || !existingToken.user) {
    throw new AppError('Refresh token is invalid or expired.', 401, 'INVALID_REFRESH_TOKEN');
  }

  if (!isUserEligible(existingToken.user)) {
    throw new AppError('User is no longer eligible to authenticate.', 401, 'ACCOUNT_INACTIVE');
  }

  const user = existingToken.user;
  const newRefreshTokenValue = generateRefreshTokenValue();
  const newRefreshHash = hashToken(newRefreshTokenValue);
  const now = new Date();

  const finalToken = await User.sequelize.transaction(async (transaction) => {
    await authRepository.revokeRefreshTokenById(existingToken.id, transaction);
    const newTokenEntry = await authRepository.createRefreshTokenEntry({
      userId: user.id,
      tokenHash: newRefreshHash,
      deviceInfo: existingToken.device_info,
      expiresAt: getRefreshTokenExpiry(),
    });

    return {
      accessToken: generateAccessToken(user),
      refreshToken: newRefreshTokenValue,
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
    const tokenRecord = await RefreshToken.findOne({ where: { user_id: user.id, token_hash: tokenHash, revoked_at: null } });
    if (tokenRecord) {
      await tokenRecord.update({ revoked_at: new Date() });
    }
  } else {
    await authRepository.revokeAllUserRefreshTokens(user.id);
  }

  return { revoked: true };
}

async function forgotPassword({ email }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw new AppError('Email is required.', 400, 'VALIDATION_ERROR');
  }

  const user = await authRepository.findUserByEmail(normalizedEmail);
  if (!user) {
    return { sent: false, message: 'If that email exists, a reset link will be sent.' };
  }

  const resetToken = randomToken(32);
  const resetHash = hashToken(resetToken);
  const expiresAt = new Date(Date.now() + Number(env.PASSWORD_RESET_EXPIRES_IN.match(/[0-9]+/) || 60) * 60 * 1000);

  await PasswordResetToken.create({
    user_id: user.id,
    token_hash: resetHash,
    requested_at: new Date(),
    expires_at: expiresAt,
    used_at: null,
  });

  const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;
  return {
    sent: true,
    message: 'If that email exists, a reset link will be sent.',
    resetToken: env.NODE_ENV === 'production' ? undefined : resetToken,
    resetUrl: env.NODE_ENV === 'production' ? undefined : resetUrl,
  };
}

async function resetPassword({ token, password }) {
  if (!token || !password) {
    throw new AppError('Reset token and new password are required.', 400, 'VALIDATION_ERROR');
  }

  const tokenHash = hashToken(token);
  const resetToken = await authRepository.findActivePasswordResetToken(tokenHash);

  if (!resetToken || !resetToken.user) {
    throw new AppError('Reset token is invalid or expired.', 401, 'INVALID_RESET_TOKEN');
  }

  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters.', 400, 'VALIDATION_ERROR');
  }

  const newPasswordHash = await hashPassword(password);

  await User.sequelize.transaction(async (transaction) => {
    await User.update({ password_hash: newPasswordHash, password_changed_at: new Date(), must_change_password: false }, { where: { id: resetToken.user_id }, transaction });
    await authRepository.markPasswordResetTokenUsed(resetToken.id, transaction);
    await authRepository.revokeAllUserRefreshTokens(resetToken.user_id, transaction);
  });

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

  const newHash = await hashPassword(newPassword);
  await User.sequelize.transaction(async (transaction) => {
    await User.update({ password_hash: newHash, password_changed_at: new Date(), must_change_password: false }, { where: { id: user.id }, transaction });
    await authRepository.revokeAllUserRefreshTokens(user.id, transaction);
  });

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
  const allowedFields = ['full_name', 'phone', 'highest_qualification', 'training_status', 'avatar_url', 'facility_id'];
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

async function listUsers({ page = 1, limit = 20, role, status, facilityId }) {
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (facilityId) filter.facility_id = facilityId;

  const { count, rows } = await User.findAndCountAll({
    where: filter,
    order: [['id', 'ASC']],
    limit: Number(limit),
    offset: (Number(page) - 1) * Number(limit),
    attributes: { exclude: ['password_hash'] },
  });

  return {
    items: rows.map((entry) => entry.toJSON()),
    total: count,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.max(1, Math.ceil(count / Number(limit))),
  };
}

async function getUserByIdForAdmin(userId) {
  const user = await authRepository.findUserById(userId);
  if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
  return sanitizeUser(user);
}

async function createUserByAdmin(payload) {
  const cleanedRole = String(payload.role || '').trim().toLowerCase();
  if (!USER_SYSTEM_ROLES.has(cleanedRole)) {
    throw new AppError('Unsupported role selected for account creation.', 422, 'INVALID_ROLE');
  }

  const email = String(payload.email || '').trim().toLowerCase();
  const existing = await authRepository.findUserByEmail(email);
  if (existing) {
    throw new AppError('An account already exists for this email.', 409, 'USER_EXISTS');
  }

  const password = payload.password || randomToken(12);
  const hashed = await hashPassword(password);
  const user = await User.create({
    full_name: payload.full_name,
    email,
    phone: payload.phone || null,
    password_hash: hashed,
    role: cleanedRole,
    facility_id: payload.facility_id || null,
    highest_qualification: payload.highest_qualification || null,
    training_status: payload.training_status || null,
    avatar_url: payload.avatar_url || null,
    status: payload.status || 'active',
    must_change_password: payload.must_change_password !== false,
    password_changed_at: new Date(),
    created_by: payload.created_by || null,
  });

  return sanitizeUser(user);
}

async function updateUserStatus(userId, status) {
  const user = await authRepository.findUserById(userId);
  if (!user) throw new AppError('User not found.', 404, 'USER_NOT_FOUND');
  if (!['active', 'inactive', 'suspended'].includes(String(status))) {
    throw new AppError('Unsupported account status.', 422, 'INVALID_STATUS');
  }
  await user.update({ status });
  return sanitizeUser(user);
}

async function requireRole(user, allowedRoles) {
  if (!user) throw new AppError('Authentication required.', 401, 'UNAUTHORIZED');
  if (!allowedRoles.includes(String(user.role || '').toLowerCase())) {
    throw new AppError('You do not have permission to perform this action.', 403, 'FORBIDDEN');
  }
}

module.exports = {
  login,
  refreshToken,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  getSession,
  getUserProfile,
  updateUserProfile,
  updateUserPreferences,
  listUsers,
  getUserByIdForAdmin,
  createUserByAdmin,
  updateUserStatus,
  requireRole,
  sanitizeUser,
  isUserEligible,
};
