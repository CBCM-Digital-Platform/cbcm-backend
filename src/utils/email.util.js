const nodemailer = require('nodemailer');
const env = require('../config/env');

async function sendPasswordResetEmail({ to, resetUrl }) {
  if (!env.SMTP_HOST) return false;

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: 'Reset your CBCM password',
    text: `Use this link to reset your password: ${resetUrl}`,
  });
  return true;
}

async function sendOtpEmail({ to, otp }) {
  if (!env.SMTP_HOST) return false;

  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
  });

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: 'Your CBCM password reset code',
    text: `Your CBCM password reset code is ${otp}. It is valid for a short time and can only be used once.`,
  });
  return true;
}

module.exports = { sendPasswordResetEmail, sendOtpEmail };