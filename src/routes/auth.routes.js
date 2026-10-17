const express = require('express');
const authController = require('../controllers/auth.controller');
const { loginValidation, refreshTokenValidation, logoutValidation, forgotPasswordValidation, resetPasswordValidation, changePasswordValidation } = require('../validators/auth.validator');
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

router.post('/forgot-password', forgotPasswordValidation, validateRequest, authController.forgotPassword);

router.post('/reset-password', resetPasswordValidation, validateRequest, authController.resetPassword);

router.post('/change-password', authenticate, changePasswordValidation, validateRequest, authController.changePassword);

router.get('/session', authenticate, authController.getSession);

module.exports = router;
