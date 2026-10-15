const nodemailer = require('nodemailer');
const env = require('../config/env');

function createTransporter() {
  return nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } } : {}),
  });
}

async function sendEmail({ to, subject, text }) {
  if (env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Resend API returned HTTP ${response.status}.`);
    }
    return true;
  }

  if (!env.SMTP_HOST) return false;

  const transporter = createTransporter();
  await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text });
  return true;
}

async function sendPasswordResetEmail({ to, resetUrl }) {
  return sendEmail({
    to,
    subject: 'Reset your CBCM password',
    text: `Use this link to reset your password: ${resetUrl}`,
  });
}

async function sendOtpEmail({ to, otp }) {
  return sendEmail({
    to,
    subject: 'Your CBCM password reset code',
    text: `Your CBCM password reset code is ${otp}. It is valid for a short time and can only be used once.`,
  });
}

module.exports = { sendPasswordResetEmail, sendOtpEmail };