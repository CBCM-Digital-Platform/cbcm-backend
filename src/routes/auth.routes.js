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

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: Log in a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     description: Authenticates an active, provisioned user. Public self-registration is not enabled; users are provisioned by an administrator.
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LoginResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Invalid credentials or inactive account
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
router.post('/login', loginValidation, validateRequest, authController.login);

/**
 * @openapi
 * /api/v1/auth/refresh-token:
 *   post:
 *     summary: Refresh an access token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshTokenRequest'
 *     description: Rotates a valid opaque refresh token. The presented token is revoked and cannot be reused.
 *     responses:
 *       200:
 *         description: Token rotation successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RefreshTokenResponse'
 *       400:
 *         description: Refresh token is missing or malformed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Token is invalid, expired, revoked, replayed, or belongs to an inactive user
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
router.post('/refresh-token', refreshTokenValidation, validateRequest, authController.refreshToken);

/**
 * @openapi
 * /api/v1/auth/logout:
 *   post:
 *     summary: Log out and revoke refresh token(s)
 *     description: Requires an access token. Revokes the supplied refresh token for this user, or all of the user's active refresh tokens when omitted.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LogoutRequest'
 *     responses:
 *       200:
 *         description: Logout completed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BooleanActionResponse'
 *       400:
 *         description: Invalid refresh token input
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Missing or invalid access token
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

/**
 * @openapi
 * /api/v1/auth/change-password:
 *   post:
 *     summary: Change the authenticated user's password
 *     description: Requires the current password, clears must_change_password, and revokes refresh sessions. Existing access tokens are invalidated.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ChangePasswordRequest'
 *     responses:
 *       200:
 *         description: Password changed
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
 *         description: Missing authentication or incorrect current password
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
router.post('/change-password', authenticate, changePasswordValidation, validateRequest, authController.changePassword);

/**
 * @openapi
 * /api/v1/auth/session:
 *   get:
 *     summary: Validate the current access-token session
 *     description: Verifies the bearer JWT and returns the current safe user profile when the account remains active.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current session is valid
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SessionResponse'
 *       401:
 *         description: Missing, invalid, expired, stale, or inactive session
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
router.get('/session', authenticate, authController.getSession);

module.exports = router;
