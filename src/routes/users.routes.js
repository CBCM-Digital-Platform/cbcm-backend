const express = require('express');
const usersController = require('../controllers/users.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { validationResult } = require('express-validator');
const { registerValidation, updateProfileValidation, preferencesValidation, listUsersValidation, userIdValidation, updateUserStatusValidation } = require('../validators/auth.validator');
const { FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');

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

/**
 * @openapi
 * /api/v1/users/me:
 *   get:
 *     summary: Get current user's profile
 *     description: Returns the authenticated user's safe profile fields only.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Safe profile returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfileResponse'
 *       401:
 *         description: Missing or invalid access token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me', usersController.getCurrentUser);

/**
 * @openapi
 * /api/v1/users/me:
 *   patch:
 *     summary: Update current user's editable profile fields
 *     description: Only full_name, phone, highest_qualification, training_status, and avatar_url are editable. Role, status, facility, and credential fields cannot be changed here.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileRequest'
 *     responses:
 *       200:
 *         description: Updated safe profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfileResponse'
 *       400:
 *         description: Profile validation error
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
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch(
  '/me',
  rejectUnexpectedFields(['full_name', 'phone', 'highest_qualification', 'training_status', 'avatar_url']),
  updateProfileValidation,
  validateRequest,
  usersController.updateCurrentUser
);

/**
 * @openapi
 * /api/v1/users/me/preferences:
 *   get:
 *     summary: Get current user's preferences
 *     description: Reads preferences for the authenticated user only and returns null when none have been saved.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Preferences returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PreferencesResponse'
 *       401:
 *         description: Missing or invalid access token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/me/preferences', usersController.getCurrentUserPreferences);

/**
 * @openapi
 * /api/v1/users/me/preferences:
 *   patch:
 *     summary: Update current user's preferences
 *     description: Updates or creates preferences for the authenticated user only.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserPreferencesRequest'
 *     responses:
 *       200:
 *         description: Preferences updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/PreferencesResponse'
 *       400:
 *         description: Preference validation error
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
 */
router.patch(
  '/me/preferences',
  rejectUnexpectedFields(['language', 'theme', 'notifications_enabled']),
  preferencesValidation,
  validateRequest,
  usersController.updateCurrentUserPreferences
);

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     summary: List users (administrator only)
 *     description: Returns safe profile fields with pagination. Only administrators may list users.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [admin, facility_admin, mentor, mentee] }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [active, inactive, suspended] }
 *     responses:
 *       200:
 *         description: Paginated safe user list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserListResponse'
 *       400:
 *         description: Invalid pagination or filter
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
 *       403:
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', requireRole(FACILITY_MANAGEMENT_ROLES), listUsersValidation, validateRequest, usersController.listUsers);

/**
 * @openapi
 * /api/v1/users/{id}:
 *   get:
 *     summary: Get a user by ID (administrator only)
 *     description: Returns a safe user profile; password and credential secrets are never included.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Safe user profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfileResponse'
 *       400:
 *         description: Invalid user ID
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
 *       403:
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', requireRole(FACILITY_MANAGEMENT_ROLES), userIdValidation, validateRequest, usersController.getUserById);

/**
 * @openapi
 * /api/v1/users:
 *   post:
 *     summary: Provision a user (administrator only)
 *     description: Public self-registration is not supported. An administrator provisions a user with an allowed role and temporary password; password change is required by default.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateUserRequest'
 *     responses:
 *       201:
 *         description: User provisioned; password hash is never returned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfileResponse'
 *       400:
 *         description: Validation error
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
 *       403:
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Facility not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post(
  '/',
  requireRole(FACILITY_MANAGEMENT_ROLES),
  rejectUnexpectedFields(['full_name', 'email', 'password', 'role', 'facility_id', 'phone', 'highest_qualification', 'training_status', 'must_change_password']),
  registerValidation,
  validateRequest,
  usersController.createUser
);

/**
 * @openapi
 * /api/v1/users/{id}/status:
 *   patch:
 *     summary: Change a user's status (administrator only)
 *     description: Deactivating or suspending a user revokes their refresh tokens and invalidates existing access tokens.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateUserStatusRequest'
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserProfileResponse'
 *       400:
 *         description: Invalid ID or status
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
 *       403:
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Administrator cannot disable their own account
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id/status', requireRole(FACILITY_MANAGEMENT_ROLES), updateUserStatusValidation, validateRequest, usersController.updateUserStatus);

module.exports = router;
