const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/logbook.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const {
	createLogbookValidation,
	updateLogbookValidation,
	submitLogbookValidation,
	logbookIdValidation,
	approveLogbookValidation,
	requestRevisionValidation,
	listLogbookValidation,
	menteeIdValidation,
} = require('../validators/logbook.validator');

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
 * /api/v1/logbook:
 *   get:
 *     summary: List logbook entries
 *     description: Lists logbook entries with authorized filters and pagination.
 *     tags: [Logbook]
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
 *         name: mentee_id
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, submitted, approved, needs_revision, rejected, cancelled] }
 *       - in: query
 *         name: thematic_area_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated logbook entries
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 */
router.get('/', listLogbookValidation, validateRequest, controller.list);

/**
 * @openapi
 * /api/v1/logbook/{id}:
 *   get:
 *     summary: Get a logbook entry
 *     description: Retrieves a specific logbook entry by ID with related data.
 *     tags: [Logbook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Logbook entry details
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Logbook entry not found
 */
router.get('/:id', logbookIdValidation, validateRequest, controller.getById);

/**
 * @openapi
 * /api/v1/logbook:
 *   post:
 *     summary: Create a logbook entry
 *     description: Creates a new draft logbook entry for a mentee.
 *     tags: [Logbook]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mentee_id
 *             properties:
 *               mentee_id:
 *                 type: integer
 *               encounter_id:
 *                 type: integer
 *               thematic_area_id:
 *                 type: integer
 *               procedure_type:
 *                 type: string
 *               hours:
 *                 type: number
 *               clinical_notes:
 *                 type: string
 *               outcome:
 *                 type: string
 *               goal_progress:
 *                 type: number
 *     responses:
 *       201:
 *         description: Logbook entry created
 *       400:
 *         description: Validation error or business rule violation
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Related entity not found
 */
router.post('/', createLogbookValidation, validateRequest, controller.create);

/**
 * @openapi
 * /api/v1/logbook/{id}/submit:
 *   post:
 *     summary: Submit a logbook entry for review
 *     description: Submits a draft logbook entry for mentor review. Transitions status from draft to submitted.
 *     tags: [Logbook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Logbook entry submitted
 *       400:
 *         description: Invalid status transition
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Logbook entry not found
 */
router.post('/:id/submit', submitLogbookValidation, validateRequest, controller.submit);

/**
 * @openapi
 * /api/v1/logbook/{id}:
 *   patch:
 *     summary: Update a logbook entry
 *     description: Updates a draft or needs_revision logbook entry.
 *     tags: [Logbook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               thematic_area_id:
 *                 type: integer
 *               procedure_type:
 *                 type: string
 *               hours:
 *                 type: number
 *               clinical_notes:
 *                 type: string
 *               outcome:
 *                 type: string
 *               goal_progress:
 *                 type: number
 *               status:
 *                 type: string
 *                 enum: [draft, submitted, cancelled]
 *     responses:
 *       200:
 *         description: Logbook entry updated
 *       400:
 *         description: Invalid status or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Logbook entry not found
 */
router.patch('/:id', updateLogbookValidation, validateRequest, controller.update);

/**
 * @openapi
 * /api/v1/logbook/{id}/approve:
 *   post:
 *     summary: Approve a logbook entry
 *     description: Approves a submitted logbook entry. Mentors and admins only.
 *     tags: [Logbook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Logbook entry approved
 *       400:
 *         description: Invalid status transition
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Logbook entry not found
 */
router.post('/:id/approve', approveLogbookValidation, validateRequest, controller.approve);

/**
 * @openapi
 * /api/v1/logbook/{id}/request-revision:
 *   post:
 *     summary: Request revision for a logbook entry
 *     description: Requests revision for a logbook entry with a reason. Mentors and admins only.
 *     tags: [Logbook]
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
 *             type: object
 *             required:
 *               - revision_reason
 *             properties:
 *               revision_reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Revision requested
 *       400:
 *         description: Invalid status transition or missing reason
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Logbook entry not found
 */
router.post('/:id/request-revision', requestRevisionValidation, validateRequest, controller.requestRevision);

/**
 * @openapi
 * /api/v1/logbook/progress/{mentee_id}:
 *   get:
 *     summary: Get mentee logbook progress summary
 *     description: Returns status counts and total approved hours for a mentee.
 *     tags: [Logbook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mentee_id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Progress summary
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Mentee not found
 */
router.get('/progress/:mentee_id', menteeIdValidation, validateRequest, controller.getProgress);

module.exports = router;
