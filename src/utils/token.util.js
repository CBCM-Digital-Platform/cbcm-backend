// src/utils/token.util.js
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function generateAccessToken(user) {
  return jwt.sign(
    {
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

function getRefreshTokenExpiry() {
  const match = /^([0-9]+)([smhd])$/i.exec(String(env.JWT_REFRESH_EXPIRES_IN || '30d'));
  if (!match) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 }[unit] || 24 * 60 * 60 * 1000;
  return new Date(Date.now() + value * multiplier);
}

module.exports = {
  generateAccessToken,
  verifyAccessToken,
  generateRefreshTokenValue,
  getRefreshTokenExpiry,
};
