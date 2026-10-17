const express = require('express');
const usersController = require('../controllers/users.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { validationResult } = require('express-validator');
const { registerValidation, updateProfileValidation, preferencesValidation, listUsersValidation, userIdValidation, updateUserStatusValidation } = require('../validators/auth.validator');
const { ADMIN_ROLES } = require('../constants/roles.constants');

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

function rejectUnexpectedFields(allowedFields) {
  return (req, res, next) => {
    const fields = Object.keys(req.body || {});
    const unexpected = fields.filter((field) => !allowedFields.includes(field));
    if (unexpected.length || fields.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request contains unsupported fields or no editable fields.',
          details: unexpected.map((field) => `Unsupported field: ${field}`),
        },
      });
    }
    return next();
  };
}

router.use(authenticate);

router.get('/me', usersController.getCurrentUser);

router.patch(
  '/me',
  rejectUnexpectedFields(['full_name', 'phone', 'highest_qualification', 'training_status', 'avatar_url']),
  updateProfileValidation,
  validateRequest,
  usersController.updateCurrentUser
);

router.get('/me/preferences', usersController.getCurrentUserPreferences);

router.patch(
  '/me/preferences',
  rejectUnexpectedFields(['language', 'theme', 'notifications_enabled']),
  preferencesValidation,
  validateRequest,
  usersController.updateCurrentUserPreferences
);

router.get('/', requireRole(ADMIN_ROLES), listUsersValidation, validateRequest, usersController.listUsers);

router.get('/:id', requireRole(ADMIN_ROLES), userIdValidation, validateRequest, usersController.getUserById);

router.post(
  '/',
  requireRole(ADMIN_ROLES),
  rejectUnexpectedFields(['full_name', 'email', 'password', 'role', 'facility_id', 'phone', 'highest_qualification', 'training_status', 'must_change_password']),
  registerValidation,
  validateRequest,
  usersController.createUser
);

router.patch('/:id/status', requireRole(ADMIN_ROLES), updateUserStatusValidation, validateRequest, usersController.updateUserStatus);

module.exports = router;
