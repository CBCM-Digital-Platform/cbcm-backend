// src/utils/token.util.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function generateAccessToken(user) {
  return jwt.sign(
    {
      token_use: 'access',
      password_version: user.password_changed_at ? new Date(user.password_changed_at).getTime() : 0,
      sub: user.id,
      email: user.email,
      role: user.role,
      facilityId: user.facility_id,
      status: user.status,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES_IN }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

function generateRefreshTokenValue() {
  return crypto.randomBytes(32).toString('hex');
}

function getDurationMilliseconds(duration, fallbackMilliseconds) {
  const match = /^([0-9]+)([smhd])$/i.exec(String(duration || ''));
  if (!match) return fallbackMilliseconds;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[unit] || 24 * 60 * 60 * 1000;
  return value * multiplier;
}

function getRefreshTokenExpiry() {
  const duration = getDurationMilliseconds(env.JWT_REFRESH_EXPIRES_IN, 30 * 24 * 60 * 60 * 1000);
  return new Date(Date.now() + duration);
}

function getPasswordResetTokenExpiry() {
  const duration = getDurationMilliseconds(env.PASSWORD_RESET_EXPIRES_IN, 60 * 60 * 1000);
  return new Date(Date.now() + duration);
}

function getOtpExpiry() {
  const duration = getDurationMilliseconds(env.OTP_EXPIRES_IN, 10 * 60 * 1000);
  return new Date(Date.now() + duration);
}

module.exports = {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshTokenValue,
  getRefreshTokenExpiry,
  getPasswordResetTokenExpiry,
  getOtpExpiry,
};
