const express = require('express');
const authController = require('../controllers/auth.controller');
const { loginValidation, refreshTokenValidation, logoutValidation, forgotPasswordValidation, forgotOtpValidation, resetPasswordValidation, resetOtpValidation, changePasswordValidation } = require('../validators/auth.validator');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const { validationResult } = require('express-validator');

const router = express.Router();

function validateRequest(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: errors.array().map((error) => error.msg),
      },
    });
  }
  return next();
}

router.post('/login', loginValidation, validateRequest, authController.login);

router.post('/refresh-token', refreshTokenValidation, validateRequest, authController.refreshToken);

router.post('/logout', authenticate, logoutValidation, validateRequest, authController.logout);

/**
 * @openapi
 * /api/v1/auth/forgot-otp:
 *   post:
 *     summary: Request a one-time password code
 *     description: Public endpoint that sends a six-digit OTP to the registered email address if the account exists. The response is intentionally generic.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotOtpRequest'
 *     responses:
 *       200:
 *         description: Generic success response without account-existence leakage
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Email validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many OTP requests for this user within a short time window
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/forgot-otp', forgotOtpValidation, validateRequest, authController.forgotOtp);

/**
 * @openapi
 * /api/v1/auth/reset-otp:
 *   post:
 *     summary: Reset a password with a single-use OTP
 *     description: Verifies a six-digit OTP, checks expiry and reuse, and resets the user's password while revoking active refresh sessions.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetOtpRequest'
 *     responses:
 *       200:
 *         description: Password reset complete; existing refresh sessions are revoked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BooleanActionResponse'
 *       400:
 *         description: Validation error, mismatched confirmation, or unchanged password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid, expired, locked, or previously used OTP
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/reset-otp', resetOtpValidation, validateRequest, authController.resetOtp);

/**
 * @openapi
 * /api/v1/auth/forgot-password:
 *   post:
 *     summary: Request a password-reset link
 *     description: Public endpoint that sends a password-reset email to the registered account if it exists. The response is intentionally generic and does not confirm whether the user exists.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: Generic response that does not disclose account existence
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MessageResponse'
 *       400:
 *         description: Email validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       429:
 *         description: Too many reset-link requests for a user within a short time window
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/forgot-password', forgotPasswordValidation, validateRequest, authController.forgotPassword);

/**
 * @openapi
 * /api/v1/auth/reset-password:
 *   post:
 *     summary: Reset a password with a one-time email token
 *     description: Validates the reset token, enforces expiry and single-use rules, and revokes active refresh sessions when the new password is accepted.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset; existing refresh sessions are revoked
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BooleanActionResponse'
 *       400:
 *         description: Validation error or unchanged password
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid, expired, or previously used reset token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/reset-password', resetPasswordValidation, validateRequest, authController.resetPassword);

router.post('/change-password', authenticate, changePasswordValidation, validateRequest, authController.changePassword);

router.get('/session', authenticate, authController.getSession);

module.exports = router;
