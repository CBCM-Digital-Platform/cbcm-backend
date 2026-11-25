// src/routes/practical-checklists.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/practical-checklists.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const {
	checklistIdValidation,
	createChecklistValidation,
	updateChecklistValidation,
	listChecklistsValidation,
	publishChecklistValidation,
	archiveChecklistValidation,
} = require('../validators/practical-checklists.validator');

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
 * /api/v1/practical-checklists:
 *   get:
 *     summary: List practical checklists
 *     description: Lists practical assessment checklist templates. System Admins see all statuses; other roles see published checklists only.
 *     tags: [Practical Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: thematic_area_id
 *         schema: { type: integer }
 *       - in: query
 *         name: procedure
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, published, archived] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *     responses:
 *       200:
 *         description: Paginated practical checklists
 *       401:
 *         description: Authentication required
 */
router.get('/', listChecklistsValidation, validateRequest, controller.list);

/**
 * @openapi
 * /api/v1/practical-checklists:
 *   post:
 *     summary: Create a practical checklist
 *     description: Creates a draft practical checklist template for a thematic area and procedure. System Admin only. A new version number is assigned automatically per thematic area + procedure scope.
 *     tags: [Practical Checklists]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [thematic_area_id, procedure, title]
 *             properties:
 *               thematic_area_id: { type: integer }
 *               procedure: { type: string, description: 'Clinical procedure or practical skill this checklist evaluates.' }
 *               title: { type: string }
 *               description: { type: string }
 *               reference_file_id: { type: integer, description: 'Optional uploaded reference document.' }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item_text: { type: string }
 *                     is_required: { type: boolean }
 *                     is_critical: { type: boolean }
 *     responses:
 *       201:
 *         description: Checklist draft created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only system administrators can manage checklists
 */
router.post('/', createChecklistValidation, validateRequest, controller.create);

/**
 * @openapi
 * /api/v1/practical-checklists/{id}:
 *   get:
 *     summary: Get a practical checklist
 *     description: Retrieves a checklist with its ordered items. Non-admin roles can only view published checklists.
 *     tags: [Practical Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Checklist details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Checklist is not published
 *       404:
 *         description: Checklist not found
 */
router.get('/:id', checklistIdValidation, validateRequest, controller.getById);

/**
 * @openapi
 * /api/v1/practical-checklists/{id}:
 *   patch:
 *     summary: Update a practical checklist draft
 *     description: Updates a draft checklist. Published or archived checklists cannot be edited; create a new version instead. System Admin only.
 *     tags: [Practical Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               procedure: { type: string }
 *               title: { type: string }
 *               description: { type: string }
 *               reference_file_id: { type: integer }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item_text: { type: string }
 *                     is_required: { type: boolean }
 *                     is_critical: { type: boolean }
 *     responses:
 *       200:
 *         description: Checklist updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only system administrators can manage checklists
 *       404:
 *         description: Checklist not found
 *       409:
 *         description: Checklist is not a draft
 */
router.patch('/:id', updateChecklistValidation, validateRequest, controller.update);

/**
 * @openapi
 * /api/v1/practical-checklists/{id}/publish:
 *   post:
 *     summary: Publish a practical checklist
 *     description: Publishes a draft checklist and archives any previously published version of the same thematic area + procedure. The checklist must contain at least one item and one required item. System Admin only.
 *     tags: [Practical Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Checklist published
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only system administrators can manage checklists
 *       404:
 *         description: Checklist not found
 *       409:
 *         description: Checklist is archived
 *       422:
 *         description: Checklist has no items or no required items
 */
router.post('/:id/publish', publishChecklistValidation, validateRequest, controller.publish);

/**
 * @openapi
 * /api/v1/practical-checklists/{id}/archive:
 *   post:
 *     summary: Archive a practical checklist
 *     description: Deactivates a checklist without deleting it. Historical assessment responses referencing the checklist version are preserved. System Admin only.
 *     tags: [Practical Checklists]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Checklist archived
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only system administrators can manage checklists
 *       404:
 *         description: Checklist not found
 */
router.post('/:id/archive', archiveChecklistValidation, validateRequest, controller.archive);

module.exports = router;
