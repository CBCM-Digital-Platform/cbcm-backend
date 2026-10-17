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

/**
 * @openapi
 * /api/v1/users:
 *   get:
 *     summary: List users (system or facility administrator)
 *     description: Returns safe profile fields with pagination. Facility administrators can only list users within their facility.
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
 *         description: System administrator or facility administrator role required
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
 *     summary: Get a user by ID (system or facility administrator)
 *     description: Returns a safe user profile; facility administrators can only access users within their facility. Password and credential secrets are never included.
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
 *         description: System administrator or facility administrator with access to the user required
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
 *     summary: Change a user's status (system or facility administrator)
 *     description: Deactivating or suspending a user revokes their refresh tokens and invalidates existing access tokens. Facility administrators can only manage users within their facility.
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
 *         description: System administrator or facility administrator with access to the user required
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
