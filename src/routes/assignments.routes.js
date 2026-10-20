// src/routes/assignments.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/assignments.controller');
const matchingController = require('../controllers/matching.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');
const {
	createAssignmentValidation,
	updateAssignmentValidation,
	assignmentIdValidation,
	updateAssignmentStatusValidation,
	listAssignmentsValidation,
	menteeIdValidation,
	mentorIdValidation,
} = require('../validators/assignments.validator');
const { findMatchesValidation } = require('../validators/matching.validator');

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
 * /api/v1/assignments:
 *   get:
 *     summary: List mentor-mentee assignments
 *     description: Lists assignments with authorized filters and pagination. System Admin sees organization-wide assignments; Facility Admin sees only their facility's assignments.
 *     tags: [Assignments]
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
 *         name: mentor_id
 *         schema: { type: integer }
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
 *         name: status
 *         schema: { type: string, enum: [pending_match, assigned, completed, cancelled, unassigned] }
 *     responses:
 *       200:
 *         description: Paginated assignments
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssignmentListResponse'
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
router.get('/', listAssignmentsValidation, validateRequest, controller.list);

/**
 * @openapi
 * /api/v1/assignments/{id}:
 *   get:
 *     summary: Get an assignment
 *     description: Retrieves a specific assignment by ID with full details.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Assignment details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssignmentResponse'
 *       400:
 *         description: Invalid assignment ID
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
 *         description: Assignment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', assignmentIdValidation, validateRequest, controller.getById);

/**
 * @openapi
 * /api/v1/assignments:
 *   post:
 *     summary: Create a mentor-mentee assignment
 *     description: Manually assigns a mentor to a mentee within a cycle and facility. System Admin can assign across the organization; Facility Admin can only assign within their facility.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateAssignmentRequest'
 *     responses:
 *       201:
 *         description: Assignment created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssignmentResponse'
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
 *         description: User, facility, cycle, or thematic area not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Assignment already exists or reference conflict
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', requireRole(FACILITY_MANAGEMENT_ROLES), createAssignmentValidation, validateRequest, controller.create);

/**
 * @openapi
 * /api/v1/assignments/{id}:
 *   patch:
 *     summary: Update an assignment
 *     description: Updates editable assignment fields such as priority score, matching reason, or thematic area.
 *     tags: [Assignments]
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
 *             $ref: '#/components/schemas/UpdateAssignmentRequest'
 *     responses:
 *       200:
 *         description: Assignment updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssignmentResponse'
 *       400:
 *         description: Invalid ID, fields, or reference conflict
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
 *         description: Assignment or thematic area not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id', requireRole(FACILITY_MANAGEMENT_ROLES), assignmentIdValidation, updateAssignmentValidation, validateRequest, controller.update);

/**
 * @openapi
 * /api/v1/assignments/{id}/status:
 *   patch:
 *     summary: Update assignment status
 *     description: Transitions an assignment status. Valid transitions: pending_match → assigned → completed/cancelled.
 *     tags: [Assignments]
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
 *             $ref: '#/components/schemas/UpdateAssignmentStatusRequest'
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssignmentResponse'
 *       400:
 *         description: Invalid status or transition
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
 *         description: Assignment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id/status', requireRole(FACILITY_MANAGEMENT_ROLES), updateAssignmentStatusValidation, validateRequest, controller.updateStatus);

/**
 * @openapi
 * /api/v1/assignments/{id}/unassign:
 *   post:
 *     summary: Unassign a mentor-mentee pair
 *     description: Cancels an active assignment. System Admin can unassign any assignment; Facility Admin can only unassign within their facility.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Assignment unassigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssignmentResponse'
 *       400:
 *         description: Assignment already unassigned or cancelled
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
 *         description: Assignment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:id/unassign', requireRole(FACILITY_MANAGEMENT_ROLES), assignmentIdValidation, validateRequest, controller.unassign);

/**
 * @openapi
 * /api/v1/mentees/{menteeId}/assignments:
 *   get:
 *     summary: Get a mentee's assignments
 *     description: Retrieves all assignments for a specific mentee. Mentees can view their own assignments; mentors can view their mentees' assignments; Facility Admins can view assignments within their facility.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: menteeId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Mentee's assignments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AssignmentResponse'
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
router.get('/mentees/:menteeId/assignments', menteeIdValidation, validateRequest, controller.getMenteeAssignments);

/**
 * @openapi
 * /api/v1/mentors/{mentorId}/assignments:
 *   get:
 *     summary: Get a mentor's assignments
 *     description: Retrieves all assignments for a specific mentor. Mentors can view their own assignments; Facility Admins can view assignments within their facility.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: mentorId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Mentor's assignments
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/AssignmentResponse'
 *       400:
 *         description: Invalid mentor ID
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
 *         description: Mentor not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/mentors/:mentorId/assignments', mentorIdValidation, validateRequest, controller.getMentorAssignments);

/**
 * @openapi
 * /api/v1/assignments/matching:
 *   post:
 *     summary: Find mentor matches
 *     description: Suggests available mentors for a mentee based on facility, cycle, and optional thematic area. System Admin can match across the organization; Facility Admin can only match within their facility.
 *     tags: [Assignments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FindMatchesRequest'
 *     responses:
 *       200:
 *         description: Match suggestions
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FindMatchesResponse'
 *       400:
 *         description: Invalid criteria
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
 */
router.post('/matching', requireRole(FACILITY_MANAGEMENT_ROLES), findMatchesValidation, validateRequest, matchingController.findMatches);

module.exports = router;
