const nodemailer = require('nodemailer');
const env = require('../config/env');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

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

async function sendBrevoEmail({ to, subject, text, html }) {
  if (!env.BREVO_SENDER_EMAIL) {
    throw new Error('Brevo sender email is not configured (BREVO_SENDER_EMAIL is required).');
  }

  const recipients = (Array.isArray(to) ? to : [to]).map((recipient) => {
    if (typeof recipient === 'string') {
      return { email: recipient };
    }
    return recipient;
  });

  const body = {
    sender: {
      email: env.BREVO_SENDER_EMAIL,
      ...(env.BREVO_SENDER_NAME ? { name: env.BREVO_SENDER_NAME } : {}),
    },
    to: recipients,
    subject,
    textContent: text,
    ...(html ? { htmlContent: html } : {}),
  };

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    let errorDetail = '';
    try {
      const data = await response.json();
      errorDetail = data?.message || data?.code || '';
    } catch {
      try {
        errorDetail = await response.text();
      } catch {
        errorDetail = '';
      }
    }
    const message = errorDetail
      ? `Brevo API returned HTTP ${response.status}: ${errorDetail}`
      : `Brevo API returned HTTP ${response.status}.`;
    throw new Error(message);
  }

  return true;
}

async function sendEmail({ to, subject, text, html }) {
  if (env.BREVO_API_KEY) {
    return sendBrevoEmail({ to, subject, text, html });
  }

  if (env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: Array.isArray(to) ? to : [to], subject, text, ...(html ? { html } : {}) }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Resend API returned HTTP ${response.status}.`);
    }
    return true;
  }

  if (!env.SMTP_HOST) return false;

  const transporter = createTransporter();
  await transporter.sendMail({ from: env.SMTP_FROM, to, subject, text, ...(html ? { html } : {}) });
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

module.exports = { sendPasswordResetEmail, sendOtpEmail, sendEmail };