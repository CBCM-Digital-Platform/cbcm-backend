// src/utils/hash.util.js
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function comparePassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function randomToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

module.exports = {
  hashPassword,
  comparePassword,
  hashToken,
  randomToken,
};
