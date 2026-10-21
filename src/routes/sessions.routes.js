// src/routes/sessions.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/sessions.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');
const Role = require('../enums/role.enum');
const {
	availableTimesValidation,
	createSessionValidation,
	updateSessionValidation,
	sessionIdValidation,
	updateStatusValidation,
	listSessionsValidation,
	createNoteValidation,
} = require('../validators/sessions.validator');

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
 * /api/v1/sessions:
 *   get:
 *     summary: List clinical sessions
 *     description: Lists clinical sessions with authorized filters and pagination. Mentors see their sessions, mentees see their sessions, facility admins see sessions at their facility, system admins see all sessions.
 *     tags: [Sessions]
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
 *         name: status
 *         schema: { type: string, enum: [draft, scheduled, in_progress, completed, cancelled, terminated, no_show] }
 *       - in: query
 *         name: mode
 *         schema: { type: string, enum: [in_person, virtual, hybrid] }
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
 *         name: assignment_id
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: Paginated sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Session'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
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
 *         description: Authorization failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/', listSessionsValidation, validateRequest, controller.list);

/**
 * @openapi
 * /api/v1/sessions/{id}:
 *   get:
 *     summary: Get a clinical session
 *     description: Retrieves a specific clinical session by ID with full details.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Session details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Session'
 *       400:
 *         description: Invalid session ID
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
 *         description: Authorization failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/available-times', availableTimesValidation, validateRequest, controller.availableTimes);

/** @openapi
 * /api/v1/sessions/available-times:
 *   get:
 *     summary: Available times
 *     tags: [Sessions]
 *     parameters:
 *       - in: query
 *         name: assignment_id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: date
 *         required: true
 *         schema: { type: string, format: date }
 *       - in: query
 *         name: duration_minutes
 *         required: false
 *         schema: { type: integer, minimum: 5, maximum: 180, default: 60 }
 *     security:
 *       - bearerAuth: []
 */

router.get('/:id', sessionIdValidation, validateRequest, controller.getById);

/**
 * @openapi
 * /api/v1/sessions:
 *   post:
 *     summary: Create a clinical session
 *     description: Creates a new clinical session (draft or scheduled). Can be created as a draft without full scheduling information.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - assignment_id
 *               - mode
 *             properties:
 *               assignment_id:
 *                 type: integer
 *                 minimum: 1
 *                 description: The assignment this session belongs to
 *               mode:
 *                 type: string
 *                 enum: [in_person, virtual, hybrid]
 *                 description: Session mode
 *               scheduled_at:
 *                 type: string
 *                 format: date-time
 *                 description: Scheduled start time (required for scheduled sessions)
 *               duration_minutes:
 *                 type: integer
 *                 minimum: 5
 *                 maximum: 180
 *                 description: Duration in minutes (required for scheduled sessions)
 *               clinical_setting:
 *                 type: string
 *                 maxLength: 255
 *                 description: Clinical setting description
 *               session_goals:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Session goals
 *               preparation_notes:
 *                 type: string
 *                 maxLength: 2000
 *                 description: Preparation notes
 *               status:
 *                 type: string
 *                 enum: [draft, scheduled]
 *                 default: draft
 *                 description: Session status
 *     responses:
 *       201:
 *         description: Session created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Session'
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
 *         description: Authorization failed or facility scope violation
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
 *       409:
 *         description: Scheduling conflict or invalid assignment/cycle status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', createSessionValidation, validateRequest, controller.create);

/**
 * @openapi
 * /api/v1/sessions/{id}:
 *   patch:
 *     summary: Update a clinical session
 *     description: Updates editable session fields. Can schedule a draft by changing status to 'scheduled'.
 *     tags: [Sessions]
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
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [in_person, virtual, hybrid]
 *               scheduled_at:
 *                 type: string
 *                 format: date-time
 *               duration_minutes:
 *                 type: integer
 *                 minimum: 5
 *                 maximum: 180
 *               clinical_setting:
 *                 type: string
 *                 maxLength: 255
 *               session_goals:
 *                 type: string
 *                 maxLength: 2000
 *               preparation_notes:
 *                 type: string
 *                 maxLength: 2000
 *               status:
 *                 type: string
 *                 enum: [draft, scheduled]
 *     responses:
 *       200:
 *         description: Session updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Session'
 *       400:
 *         description: Invalid ID, fields, or transition
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
 *         description: Authorization failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Scheduling conflict
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id', updateSessionValidation, validateRequest, controller.update);

/**
 * @openapi
 * /api/v1/sessions/{id}/status:
 *   patch:
 *     summary: Update session status
 *     description: "Transitions session status. Valid transitions: draft → scheduled; scheduled → in_progress/completed/cancelled/no_show; in_progress → completed/terminated/cancelled."
 *     tags: [Sessions]
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [draft, scheduled, in_progress, completed, cancelled, terminated, no_show]
 *     responses:
 *       200:
 *         description: Status updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Session'
 *       400:
 *         description: Invalid status transition
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
 *         description: Authorization failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id/status', updateStatusValidation, validateRequest, controller.updateStatus);

/**
 * @openapi
 * /api/v1/sessions/{id}/notes:
 *   post:
 *     summary: Create clinical note
 *     description: Creates a clinical note for a session. Only the assigned mentor can create notes.
 *     tags: [Sessions]
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
 *               - note
 *             properties:
 *               note:
 *                 type: string
 *                 maxLength: 5000
 *                 description: Clinical note content
 *     responses:
 *       201:
 *         description: Note created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     encounter_id:
 *                       type: integer
 *                     mentor_id:
 *                       type: integer
 *                     note:
 *                       type: string
 *                     created_at:
 *                       type: string
 *                       format: date-time
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
 *         description: Not a mentor or not assigned to this session
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:id/notes', createNoteValidation, validateRequest, controller.createNote);

/**
 * @openapi
 * /api/v1/sessions/{id}/notes:
 *   get:
 *     summary: Get clinical notes
 *     description: Retrieves all clinical notes for a session.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Clinical notes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       encounter_id:
 *                         type: integer
 *                       mentor_id:
 *                         type: integer
 *                       note:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       mentor:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           full_name:
 *                             type: string
 *                           email:
 *                             type: string
 *       400:
 *         description: Invalid session ID
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
 *         description: Authorization failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id/notes', sessionIdValidation, validateRequest, controller.getNotes);

/**
 * @openapi
 * /api/v1/sessions/{id}/join-token:
 *   post:
 *     summary: Get Jitsi join token
 *     description: Generates a signed JWT token for joining a virtual session. Only available for virtual sessions that are scheduled or in progress. Only session participants can request tokens.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Jitsi join token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     domain:
 *                       type: string
 *                       description: Jitsi domain
 *                     room:
 *                       type: string
 *                       description: Room identifier
 *                     token:
 *                       type: string
 *                       description: Signed JWT token
 *                     expires_at:
 *                       type: string
 *                       format: date-time
 *                       description: Token expiry time
 *       400:
 *         description: Invalid session mode, status, or Jitsi not configured
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
 *         description: Not a session participant
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Jitsi not configured or token generation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:id/join-token', sessionIdValidation, validateRequest, controller.getJoinToken);

/**
 * @openapi
 * /api/v1/sessions/{id}/participant-join:
 *   post:
 *     summary: Handle participant join event
 *     description: Processes a verified participant join event from Jitsi. Automatically transitions session to in_progress when first participant joins. Requires deployment-specific webhook configuration.
 *     tags: [Sessions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Join event processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: boolean
 *       400:
 *         description: Invalid request
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
 *         description: Not a session participant
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Session not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:id/participant-join', sessionIdValidation, validateRequest, controller.handleParticipantJoin);

module.exports = router;





