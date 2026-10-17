const test = require('node:test');
const assert = require('node:assert/strict');
const emailUtil = require('../../src/utils/email.util');
const env = require('../../src/config/env');

test('email utility - Brevo integration suite', async (t) => {
  const originalBrevoApiKey = env.BREVO_API_KEY;
  const originalBrevoSenderEmail = env.BREVO_SENDER_EMAIL;
  const originalBrevoSenderName = env.BREVO_SENDER_NAME;
  const originalResendApiKey = env.RESEND_API_KEY;
  const originalSmtpHost = env.SMTP_HOST;
  const originalFetch = global.fetch;

  t.afterEach(() => {
    env.BREVO_API_KEY = originalBrevoApiKey;
    env.BREVO_SENDER_EMAIL = originalBrevoSenderEmail;
    env.BREVO_SENDER_NAME = originalBrevoSenderName;
    env.RESEND_API_KEY = originalResendApiKey;
    env.SMTP_HOST = originalSmtpHost;
    global.fetch = originalFetch;
  });

  await t.test('sends OTP email via Brevo transactional API when configured', async () => {
    let capturedUrl;
    let capturedOptions;

    env.BREVO_API_KEY = 'test-brevo-key-123';
    env.BREVO_SENDER_EMAIL = 'noreply@cbcm.org';
    env.BREVO_SENDER_NAME = 'CBCM Support';

    global.fetch = async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<test-msg-id-1@brevo.com>' }),
      };
    };

    const sent = await emailUtil.sendOtpEmail({ to: 'doctor@hospital.org', otp: '482910' });

    assert.equal(sent, true);
    assert.equal(capturedUrl, 'https://api.brevo.com/v3/smtp/email');
    assert.equal(capturedOptions.method, 'POST');
    assert.equal(capturedOptions.headers['api-key'], 'test-brevo-key-123');
    assert.equal(capturedOptions.headers['Content-Type'], 'application/json');
    assert.equal(capturedOptions.headers.accept, 'application/json');

    const body = JSON.parse(capturedOptions.body);
    assert.deepEqual(body, {
      sender: {
        email: 'noreply@cbcm.org',
        name: 'CBCM Support',
      },
      to: [{ email: 'doctor@hospital.org' }],
      subject: 'Your CBCM password reset code',
      textContent: 'Your CBCM password reset code is 482910. It is valid for a short time and can only be used once.',
    });
  });

  await t.test('sends password reset link email via Brevo with correct payload', async () => {
    let capturedOptions;

    env.BREVO_API_KEY = 'test-brevo-key-123';
    env.BREVO_SENDER_EMAIL = 'noreply@cbcm.org';
    env.BREVO_SENDER_NAME = 'CBCM Admin';

    global.fetch = async (url, options) => {
      capturedOptions = options;
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<test-msg-id-2@brevo.com>' }),
      };
    };

    const resetUrl = 'http://localhost:3000/reset-password?token=sample-reset-token';
    const sent = await emailUtil.sendPasswordResetEmail({ to: 'user@example.com', resetUrl });

    assert.equal(sent, true);
    const body = JSON.parse(capturedOptions.body);
    assert.equal(body.subject, 'Reset your CBCM password');
    assert.equal(body.textContent, `Use this link to reset your password: ${resetUrl}`);
    assert.deepEqual(body.to, [{ email: 'user@example.com' }]);
  });

  await t.test('omits sender name if BREVO_SENDER_NAME is empty', async () => {
    let capturedOptions;

    env.BREVO_API_KEY = 'test-brevo-key-123';
    env.BREVO_SENDER_EMAIL = 'noreply@cbcm.org';
    env.BREVO_SENDER_NAME = '';

    global.fetch = async (url, options) => {
      capturedOptions = options;
      return {
        ok: true,
        status: 201,
        json: async () => ({ messageId: '<test-msg-id-3@brevo.com>' }),
      };
    };

    await emailUtil.sendOtpEmail({ to: 'user@example.com', otp: '112233' });

    const body = JSON.parse(capturedOptions.body);
    assert.deepEqual(body.sender, { email: 'noreply@cbcm.org' });
    assert.equal(body.sender.name, undefined);
  });

  await t.test('throws error if BREVO_API_KEY is configured but BREVO_SENDER_EMAIL is missing', async () => {
    env.BREVO_API_KEY = 'test-brevo-key-123';
    env.BREVO_SENDER_EMAIL = '';

    await assert.rejects(
      async () => {
        await emailUtil.sendOtpEmail({ to: 'user@example.com', otp: '112233' });
      },
      {
        name: 'Error',
        message: 'Brevo sender email is not configured (BREVO_SENDER_EMAIL is required).',
      }
    );
  });

  await t.test('throws error with Brevo error message on API failure', async () => {
    env.BREVO_API_KEY = 'invalid-key';
    env.BREVO_SENDER_EMAIL = 'noreply@cbcm.org';

    global.fetch = async () => ({
      ok: false,
      status: 401,
      json: async () => ({ message: 'Key not found in database', code: 'unauthorized' }),
    });

    await assert.rejects(
      async () => {
        await emailUtil.sendOtpEmail({ to: 'user@example.com', otp: '112233' });
      },
      {
        name: 'Error',
        message: 'Brevo API returned HTTP 401: Key not found in database',
      }
    );
  });

  await t.test('throws error on Brevo API HTTP 400 with text error message', async () => {
    env.BREVO_API_KEY = 'test-brevo-key';
    env.BREVO_SENDER_EMAIL = 'noreply@cbcm.org';

    global.fetch = async () => ({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('Not JSON');
      },
      text: async () => 'Invalid parameter format',
    });

    await assert.rejects(
      async () => {
        await emailUtil.sendOtpEmail({ to: 'user@example.com', otp: '112233' });
      },
      {
        name: 'Error',
        message: 'Brevo API returned HTTP 400: Invalid parameter format',
      }
    );
  });

  await t.test('throws error on network timeout / abort and does not silently succeed', async () => {
    env.BREVO_API_KEY = 'test-brevo-key';
    env.BREVO_SENDER_EMAIL = 'noreply@cbcm.org';

    global.fetch = async () => {
      throw new Error('The operation was aborted due to timeout.');
    };

    await assert.rejects(
      async () => {
        await emailUtil.sendOtpEmail({ to: 'user@example.com', otp: '112233' });
      },
      {
        name: 'Error',
        message: 'The operation was aborted due to timeout.',
      }
    );
  });

  await t.test('falls back to Resend when Brevo is not configured', async () => {
    env.BREVO_API_KEY = '';
    env.RESEND_API_KEY = 'test-resend-key';
    env.EMAIL_FROM = 'CBCM <resend@example.com>';

    let resendCalled = false;
    global.fetch = async (url) => {
      if (url === 'https://api.resend.com/emails') {
        resendCalled = true;
        return { ok: true, status: 200 };
      }
      return { ok: false, status: 404 };
    };

    const sent = await emailUtil.sendOtpEmail({ to: 'user@example.com', otp: '998877' });
    assert.equal(sent, true);
    assert.equal(resendCalled, true);
  });

  await t.test('returns false when no provider is configured', async () => {
    env.BREVO_API_KEY = '';
    env.RESEND_API_KEY = '';
    env.SMTP_HOST = '';

    const sent = await emailUtil.sendOtpEmail({ to: 'user@example.com', otp: '998877' });
    assert.equal(sent, false);
  });
});
