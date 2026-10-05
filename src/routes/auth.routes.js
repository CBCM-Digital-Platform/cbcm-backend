const express = require('express');
const authController = require('../controllers/auth.controller');
const { loginValidation, refreshTokenValidation, forgotPasswordValidation, resetPasswordValidation, changePasswordValidation } = require('../validators/auth.validator');
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
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 *       400:
 *         description: Validation error
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
 *     responses:
 *       200:
 *         description: Token rotation successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.post('/refresh-token', refreshTokenValidation, validateRequest, authController.refreshToken);

router.post('/logout', authenticate, authController.logout);
router.post('/forgot-password', forgotPasswordValidation, validateRequest, authController.forgotPassword);
router.post('/reset-password', resetPasswordValidation, validateRequest, authController.resetPassword);
router.post('/change-password', authenticate, changePasswordValidation, validateRequest, authController.changePassword);
router.get('/session', authenticate, authController.getSession);

module.exports = router;
