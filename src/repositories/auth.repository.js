// src/repositories/auth.repository.js
const { Op, fn, col, where } = require('sequelize');
const { User, RefreshToken, PasswordResetToken, UserPreference } = require('../models');

async function findUserByEmail(email) {
  return User.findOne({ where: where(fn('lower', col('email')), String(email).trim().toLowerCase()) });
}

async function findUserById(id) {
  return User.findByPk(id);
}

async function createRefreshTokenEntry({ userId, tokenHash, deviceInfo, expiresAt }) {
  return RefreshToken.create({
    user_id: userId,
    token_hash: tokenHash,
    device_info: deviceInfo || null,
    issued_at: new Date(),
    expires_at: expiresAt,
    revoked_at: null,
  });
}

async function findRefreshTokenByHash(tokenHash) {
  return RefreshToken.findOne({
    where: { token_hash: tokenHash },
    include: [{ model: User, as: 'user' }],
  });
}

async function consumeRefreshToken(id, transaction) {
  return RefreshToken.update(
    { revoked_at: new Date() },
    { where: { id, revoked_at: null, expires_at: { [Op.gt]: new Date() } }, transaction }
  );
}

async function revokeAllUserRefreshTokens(userId, transaction) {
  return RefreshToken.update({ revoked_at: new Date() }, { where: { user_id: userId, revoked_at: null }, transaction });
}

async function createPasswordResetTokenEntry({ userId, tokenHash, expiresAt, transaction }) {
  return PasswordResetToken.create({
    user_id: userId,
    token_hash: tokenHash,
    requested_at: new Date(),
    expires_at: expiresAt,
    used_at: null,
    failed_attempts: 0,
  }, { transaction });
}

async function findActivePasswordResetToken(tokenHash) {
  return PasswordResetToken.findOne({
    where: {
      token_hash: tokenHash,
      used_at: null,
      expires_at: { [Op.gt]: new Date() },
    },
    include: [{ model: User, as: 'user' }],
  });
}

async function findPasswordResetTokenByHash(tokenHashes) {
  const values = Array.isArray(tokenHashes) ? tokenHashes : [tokenHashes];
  return PasswordResetToken.findOne({
    where: { token_hash: { [Op.in]: values } },
    include: [{ model: User, as: 'user' }],
    order: [['requested_at', 'DESC']],
  });
}

async function findLatestPasswordResetTokenForUser(userId) {
  return PasswordResetToken.findOne({
    where: { user_id: userId },
    order: [['requested_at', 'DESC']],
    include: [{ model: User, as: 'user' }],
  });
}

async function findUserPasswordResetTokens(userId) {
  return PasswordResetToken.findAll({
    where: { user_id: userId },
    order: [['requested_at', 'DESC']],
    include: [{ model: User, as: 'user' }],
  });
}

async function invalidatePasswordResetTokens(userId, transaction) {
  return PasswordResetToken.update(
    { used_at: new Date() },
    { where: { user_id: userId, used_at: null }, transaction }
  );
}

async function markPasswordResetTokenUsed(id, transaction) {
  return PasswordResetToken.update(
    { used_at: new Date() },
    { where: { id, used_at: null, expires_at: { [Op.gt]: new Date() } }, transaction }
  );
}

async function findUserPreferencesByUserId(userId) {
  return UserPreference.findOne({ where: { user_id: userId } });
}

module.exports = {
  findUserByEmail,
  findUserById,
  createRefreshTokenEntry,
  findRefreshTokenByHash,
  consumeRefreshToken,
  revokeAllUserRefreshTokens,
  createPasswordResetTokenEntry,
  findActivePasswordResetToken,
  findPasswordResetTokenByHash,
  findLatestPasswordResetTokenForUser,
  findUserPasswordResetTokens,
  invalidatePasswordResetTokens,
  markPasswordResetTokenUsed,
  findUserPreferencesByUserId,
};
