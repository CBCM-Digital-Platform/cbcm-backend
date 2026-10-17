// src/routes/thematic-areas.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/thematic-areas.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { ADMIN_ROLES } = require('../constants/roles.constants');
const {
	createThematicAreaValidation,
	updateThematicAreaValidation,
	thematicAreaIdValidation,
	listThematicAreasValidation,
} = require('../validators/thematic-areas.validator');

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
 * /api/v1/thematic-areas:
 *   get:
 *     summary: List thematic areas
 *     description: Lists all thematic areas with pagination. All authenticated users can view thematic areas.
 *     tags: [Thematic Areas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated thematic areas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ThematicAreaListResponse'
 *       400:
 *         description: Invalid pagination
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', listThematicAreasValidation, validateRequest, controller.list);

/**
 * @openapi
 * /api/v1/thematic-areas/{id}:
 *   get:
 *     summary: Get a thematic area
 *     description: Retrieves a specific thematic area by ID. All authenticated users can view thematic areas.
 *     tags: [Thematic Areas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Thematic area details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ThematicAreaResponse'
 *       400:
 *         description: Invalid thematic area ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Thematic area not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', thematicAreaIdValidation, validateRequest, controller.getById);

/**
 * @openapi
 * /api/v1/thematic-areas:
 *   post:
 *     summary: Create a thematic area
 *     description: System Admin only. Creates a new global thematic area with a unique code.
 *     tags: [Thematic Areas]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateThematicAreaRequest'
 *     responses:
 *       201:
 *         description: Thematic area created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ThematicAreaResponse'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: System Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Thematic area code already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', requireRole(ADMIN_ROLES), createThematicAreaValidation, validateRequest, controller.create);

/**
 * @openapi
 * /api/v1/thematic-areas/{id}:
 *   patch:
 *     summary: Update a thematic area
 *     description: System Admin only. Updates an existing thematic area.
 *     tags: [Thematic Areas]
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
 *             $ref: '#/components/schemas/UpdateThematicAreaRequest'
 *     responses:
 *       200:
 *         description: Thematic area updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ThematicAreaResponse'
 *       400:
 *         description: Invalid ID or fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: System Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Thematic area not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Thematic area code already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id', requireRole(ADMIN_ROLES), thematicAreaIdValidation, updateThematicAreaValidation, validateRequest, controller.update);

/**
 * @openapi
 * /api/v1/thematic-areas/{id}:
 *   delete:
 *     summary: Delete a thematic area
 *     description: System Admin only. Deletes a thematic area if it is not referenced by cycles or assignments.
 *     tags: [Thematic Areas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Thematic area deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BooleanActionResponse'
 *       400:
 *         description: Invalid thematic area ID
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: System Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Thematic area not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Thematic area is in use by cycles or assignments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:id', requireRole(ADMIN_ROLES), thematicAreaIdValidation, validateRequest, controller.destroy);

module.exports = router;
