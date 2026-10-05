require('dotenv').config();

const env = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT || 5000),
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET || 'development-access-secret-change-me',
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || 'development-refresh-secret-change-me',
  JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  PASSWORD_RESET_SECRET: process.env.PASSWORD_RESET_SECRET || process.env.JWT_REFRESH_SECRET || 'development-reset-secret-change-me',
  PASSWORD_RESET_EXPIRES_IN: process.env.PASSWORD_RESET_EXPIRES_IN || '1h',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
  SMTP_HOST: process.env.SMTP_HOST || '',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',
  SMTP_FROM: process.env.SMTP_FROM || 'no-reply@localhost',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
};

module.exports = env;
