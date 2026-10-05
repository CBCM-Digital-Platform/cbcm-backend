const express = require('express');
const usersController = require('../controllers/users.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { validationResult } = require('express-validator');
const { registerValidation, updateProfileValidation, preferencesValidation, listUsersValidation } = require('../validators/auth.validator');

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

router.use(authenticate);

/**
 * @openapi
 * /api/v1/users/me:
 *   get:
 *     security:
 *       - bearerAuth: []
 *     summary: Get current authenticated user profile
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Current user profile returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SuccessResponse'
 */
router.get('/me', usersController.getCurrentUser);
router.patch('/me', updateProfileValidation, validateRequest, usersController.updateCurrentUser);
router.patch('/me/preferences', preferencesValidation, validateRequest, usersController.updateCurrentUserPreferences);

router.get('/', requireRole(['admin']), listUsersValidation, validateRequest, usersController.listUsers);
router.get('/:id', requireRole(['admin']), usersController.getUserById);
router.post('/', requireRole(['admin']), registerValidation, validateRequest, usersController.createUser);
router.patch('/:id/status', requireRole(['admin']), usersController.updateUserStatus);

module.exports = router;
