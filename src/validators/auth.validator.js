// src/validators/auth.validator.js
const { body, query } = require('express-validator');

const allowedRoles = ['admin', 'mentor', 'mentee', 'facility_admin'];

const loginValidation = [
  body('email').isEmail().withMessage('A valid email is required.'),
  body('password').notEmpty().withMessage('Password is required.'),
];

const refreshTokenValidation = [
  body('refreshToken').notEmpty().withMessage('Refresh token is required.'),
];

const forgotPasswordValidation = [
  body('email').isEmail().withMessage('A valid email is required.'),
];

const resetPasswordValidation = [
  body('token').notEmpty().withMessage('Token is required.'),
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
  body('role').optional().isIn(allowedRoles).withMessage('Unsupported role.'),
  body('facility_id').optional().isInt({ min: 1 }).withMessage('Facility id must be positive integer.'),
];

const updateProfileValidation = [
  body('full_name').optional().trim().isLength({ min: 2 }).withMessage('Full name must be at least 2 characters.'),
  body('phone').optional().isLength({ min: 7 }).withMessage('Phone number is invalid.'),
  body('highest_qualification').optional().isLength({ min: 2 }).withMessage('Highest qualification is invalid.'),
  body('training_status').optional().isLength({ min: 2 }).withMessage('Training status is invalid.'),
  body('avatar_url').optional().isURL().withMessage('Avatar URL is invalid.'),
  body('facility_id').optional().isInt({ min: 1 }).withMessage('Facility id must be positive integer.'),
];

const preferencesValidation = [
  body('language').optional().isString().withMessage('Language must be a string.'),
  body('theme').optional().isIn(['light', 'dark', 'system']).withMessage('Theme must be light, dark, or system.'),
  body('notifications_enabled').optional().isBoolean().withMessage('notifications_enabled must be boolean.'),
];

const listUsersValidation = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
  query('role').optional().isIn(allowedRoles).withMessage('Unsupported role filter.'),
  query('status').optional().isString().withMessage('Status filter must be text.'),
];

module.exports = {
  loginValidation,
  refreshTokenValidation,
  forgotPasswordValidation,
  resetPasswordValidation,
  changePasswordValidation,
  registerValidation,
  updateProfileValidation,
  preferencesValidation,
  listUsersValidation,
};
