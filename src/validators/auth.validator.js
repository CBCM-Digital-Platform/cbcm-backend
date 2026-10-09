// src/validators/auth.validator.js
const { body, query, param } = require('express-validator');
const { USER_ROLES } = require('../constants/roles.constants');
const allowedStatuses = ['active', 'inactive', 'suspended'];

const loginValidation = [
  body('email').isEmail().withMessage('A valid email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

const refreshTokenValidation = [
  body('refreshToken').isHexadecimal().isLength({ min: 64, max: 64 }).withMessage('Refresh token must be a 64-character hexadecimal value.'),
];

const logoutValidation = [
  body('refreshToken').optional().isHexadecimal().isLength({ min: 64, max: 64 }).withMessage('Refresh token must be a 64-character hexadecimal value.'),
];

const forgotPasswordValidation = [
  body('email').isEmail().withMessage('A valid email is required.'),
];

const resetPasswordValidation = [
  body('token').isHexadecimal().isLength({ min: 64, max: 64 }).withMessage('Reset token must be a 64-character hexadecimal value.'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required.'),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be at least 8 characters.'),
];

const registerValidation = [
  body('full_name').trim().notEmpty().withMessage('Full name is required.'),
  body('email').isEmail().withMessage('A valid email is required.'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters.'),
  body('role').isIn(USER_ROLES).withMessage('A supported role is required.'),
  body('facility_id').optional().isInt({ min: 1 }).withMessage('Facility id must be positive integer.'),
  body('must_change_password').optional().isBoolean().toBoolean(),
];

const updateProfileValidation = [
  body('full_name').optional().trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters.'),
  body('phone').optional().isLength({ min: 7 }).withMessage('Phone number is invalid.'),
  body('highest_qualification').optional().isLength({ min: 2 }).withMessage('Highest qualification is invalid.'),
  body('training_status').optional().isLength({ min: 2 }).withMessage('Training status is invalid.'),
  body('avatar_url').optional().isURL().withMessage('Avatar URL is invalid.'),
];

const preferencesValidation = [
  body('language').optional().isString().isLength({ max: 20 }).withMessage('Language must be at most 20 characters.'),
  body('theme').optional().isIn(['light', 'dark', 'system']).withMessage('Theme must be light, dark, or system.'),
  body('notifications_enabled').optional().isBoolean().toBoolean().withMessage('notifications_enabled must be boolean.'),
];

const listUsersValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
  query('role').optional().isIn(USER_ROLES).withMessage('Unsupported role filter.'),
  query('status').optional().isIn(allowedStatuses).withMessage('Unsupported status filter.'),
];

const userIdValidation = [
  param('id').isInt({ min: 1 }).withMessage('User id must be a positive integer.'),
];

const updateUserStatusValidation = [
  ...userIdValidation,
  body('status').isIn(allowedStatuses).withMessage('Unsupported account status.'),
];

module.exports = {
  loginValidation,
  refreshTokenValidation,
  logoutValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
  registerValidation,
  updateProfileValidation,
  preferencesValidation,
  listUsersValidation,
  userIdValidation,
  updateUserStatusValidation,
};
