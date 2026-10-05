// src/repositories/auth.repository.js
const { Op } = require('sequelize');
const { User, RefreshToken, PasswordResetToken, UserPreference } = require('../models');

async function findUserByEmail(email) {
  return User.findOne({ where: { email: String(email).trim().toLowerCase() } });
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

async function findValidRefreshToken(tokenHash) {
  return RefreshToken.findOne({
    where: {
      token_hash: tokenHash,
      revoked_at: null,
      expires_at: { [Op.gt]: new Date() },
    },
    include: [{ model: User, as: 'user' }],
  });
}

async function revokeRefreshTokenById(id, transaction) {
  return RefreshToken.update({ revoked_at: new Date() }, { where: { id }, transaction });
}

async function revokeAllUserRefreshTokens(userId, transaction) {
  return RefreshToken.update({ revoked_at: new Date() }, { where: { user_id: userId, revoked_at: null }, transaction });
}

async function createPasswordResetTokenEntry({ userId, tokenHash, expiresAt }) {
  return PasswordResetToken.create({
    user_id: userId,
    token_hash: tokenHash,
    requested_at: new Date(),
    expires_at: expiresAt,
    used_at: null,
  });
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

async function markPasswordResetTokenUsed(id, transaction) {
  return PasswordResetToken.update({ used_at: new Date() }, { where: { id }, transaction });
}

async function findUserPreferencesByUserId(userId) {
  return UserPreference.findOne({ where: { user_id: userId } });
}

module.exports = {
  findUserByEmail,
  findUserById,
  createRefreshTokenEntry,
  findValidRefreshToken,
  revokeRefreshTokenById,
  revokeAllUserRefreshTokens,
  createPasswordResetTokenEntry,
  findActivePasswordResetToken,
  markPasswordResetTokenUsed,
  findUserPreferencesByUserId,
};
