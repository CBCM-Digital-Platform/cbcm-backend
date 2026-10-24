require('dotenv').config();
const path = require('node:path');

function parsePositiveInteger(raw, fallback, name) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || '',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  PASSWORD_RESET_EXPIRES_IN: process.env.PASSWORD_RESET_EXPIRES_IN || '1h',
  OTP_EXPIRES_IN: process.env.OTP_EXPIRES_IN || '10m',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  PUBLIC_BASE_URL: (process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/$/, ''),
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'no-reply@localhost',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  EMAIL_FROM: process.env.EMAIL_FROM || process.env.SMTP_FROM || 'no-reply@localhost',
  BREVO_API_KEY: process.env.BREVO_API_KEY || '',
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || '',
  BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME || '',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  JITSI_PUBLIC_MODE: process.env.JITSI_PUBLIC_MODE === 'true' && process.env.NODE_ENV !== 'production',
  JITSI_DOMAIN: process.env.JITSI_DOMAIN || '',
  JITSI_APP_ID: process.env.JITSI_APP_ID || '',
  JITSI_SECRET: process.env.JITSI_SECRET || '',
  JITSI_TOKEN_EXPIRY: process.env.JITSI_TOKEN_EXPIRY || '1h',
  STORAGE_PROVIDER: String(process.env.STORAGE_PROVIDER || 'local').trim().toLowerCase() || 'local',
  LOCAL_STORAGE_DIR: String(process.env.LOCAL_STORAGE_DIR || path.join(process.cwd(), 'uploads')).trim() || path.join(process.cwd(), 'uploads'),
  UPLOAD_MAX_BYTES: parsePositiveInteger(process.env.UPLOAD_MAX_BYTES, 500 * 1024 * 1024, 'UPLOAD_MAX_BYTES'),
  S3_BUCKET: String(process.env.S3_BUCKET || '').trim(),
  S3_REGION: String(process.env.S3_REGION || process.env.AWS_REGION || '').trim(),
  S3_KEY_PREFIX: String(process.env.S3_KEY_PREFIX || '').trim(),
  AWS_ACCESS_KEY_ID: String(process.env.AWS_ACCESS_KEY_ID || '').trim(),
  AWS_SECRET_ACCESS_KEY: String(process.env.AWS_SECRET_ACCESS_KEY || '').trim(),
};

module.exports = env;
