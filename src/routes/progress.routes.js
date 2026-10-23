// src/routes/progress.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/progress.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');
const {
	createSnapshotValidation,
	snapshotIdValidation,
	listSnapshotsValidation,
	summaryValidation,
	userIdValidation,
	trendsValidation,
	menteeTrendsValidation,
} = require('../validators/progress.validator');

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
 * /api/v1/progress/knowledge-snapshots:
 *   get:
 *     summary: List knowledge-score snapshots
 *     description: Lists snapshots with authorized filters and pagination. System Admin sees organization-wide snapshots; Facility Admin sees only their facility's snapshots.
 *     tags: [Progress]
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
 *         name: facility_id
 *         schema: { type: integer }
 *       - in: query
 *         name: cycle_id
 *         schema: { type: integer }
 *       - in: query
 *         name: thematic_area_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated snapshots
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SnapshotListResponse'
 *       400:
 *         description: Invalid filters
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
 *         description: Facility scope violation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/knowledge-snapshots', listSnapshotsValidation, validateRequest, controller.list);

/**
 * @openapi
 * /api/v1/progress/knowledge-snapshots/{id}:
 *   get:
 *     summary: Get a knowledge-score snapshot
 *     description: Retrieves a specific snapshot by ID.
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Snapshot details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SnapshotResponse'
 *       400:
 *         description: Invalid snapshot ID
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
 *         description: Facility scope violation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Snapshot not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/knowledge-snapshots/:id', snapshotIdValidation, validateRequest, controller.getById);

/**
 * @openapi
 * /api/v1/progress/knowledge-snapshots:
 *   post:
 *     summary: Create a knowledge-score snapshot
 *     description: Records a new knowledge-score snapshot for a mentee. System Admin can create organization-wide; Facility Admin can only create within their facility.
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateSnapshotRequest'
 *     responses:
 *       201:
 *         description: Snapshot created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SnapshotResponse'
 *       400:
 *         description: Validation error or business rule violation
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
 *         description: Administrator role required or facility scope violation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Mentee, facility, cycle, or thematic area not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/knowledge-snapshots', requireRole(FACILITY_MANAGEMENT_ROLES), createSnapshotValidation, validateRequest, controller.create);

/**
 * @openapi
 * /api/v1/progress/summary:
 *   get:
 *     summary: Get progress summary
 *     description: Returns aggregated progress metrics including average score and competency distribution. System Admin sees organization-wide summary; Facility Admin sees only their facility's summary.
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: facility_id
 *         schema: { type: integer }
 *       - in: query
 *         name: cycle_id
 *         schema: { type: integer }
 *       - in: query
 *         name: thematic_area_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Progress summary
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ProgressSummaryResponse'
 *       400:
 *         description: Invalid filters
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
 *         description: Facility scope violation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/summary', summaryValidation, validateRequest, controller.getSummary);

/**
 * @openapi
 * /api/v1/progress/mentees/{menteeId}/knowledge-snapshots:
 *   get:
 *     summary: Get a mentee's knowledge-score snapshots
 *     description: Retrieves all snapshots for a specific mentee in chronological order. Mentees can view their own snapshots; Facility Admins can view snapshots within their facility.
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menteeId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Mentee's snapshots
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SnapshotResponse'
 *       400:
 *         description: Invalid mentee ID
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
 *         description: Scope violation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Mentee not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/mentees/:menteeId/knowledge-snapshots', userIdValidation, validateRequest, controller.getMenteeSnapshots);

/**
 * @openapi
 * /api/v1/progress/mentees/{menteeId}/competencies:
 *   get:
 *     summary: Get a mentee's competency breakdown
 *     description: Returns the latest competency scores by thematic area for a specific mentee. Mentees can view their own breakdown; Facility Admins can view breakdown within their facility.
 *     tags: [Progress]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menteeId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Mentee's competency breakdown
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MenteeCompetencyBreakdownResponse'
 *       400:
 *         description: Invalid mentee ID
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
 *         description: Scope violation
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Mentee not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/mentees/:menteeId/competencies', userIdValidation, validateRequest, controller.getMenteeCompetencyBreakdown);

router.get('/trends', trendsValidation, validateRequest, controller.getTrends);

router.get('/mentees/:menteeId/trends', userIdValidation, menteeTrendsValidation, validateRequest, controller.getMenteeTrends);

module.exports = router;
