// src/routes/cycles.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/cycles.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { ADMIN_ROLES } = require('../constants/roles.constants');
const {
	cycleFields,
	createCycleValidation,
	updateCycleValidation,
	cycleIdValidation,
	cycleConfigIdValidation,
	listCyclesValidation,
	updateCycleStatusValidation,
	facilityConfigValidation,
	thematicAreaConfigValidation,
	facilityConfigIdsValidation,
	thematicAreaConfigIdsValidation,
} = require('../validators/cycles.validator');

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
 * /api/v1/mentorship-cycles:
 *   get:
 *     summary: List mentorship cycles
 *     tags: [Mentorship Cycles]
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
 *         schema: { type: string, enum: [draft, planned, active, completed, cancelled] }
 *     responses:
 *       200:
 *         description: Paginated cycle list
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleListResponse'
 *       400:
 *         description: Invalid pagination or status filter
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
router.get('/', listCyclesValidation, validateRequest, controller.list);

/**
 * @openapi
 * /api/v1/mentorship-cycles/{id}:
 *   get:
 *     summary: Get a mentorship cycle
 *     tags: [Mentorship Cycles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Cycle details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleResponse'
 *       400:
 *         description: Invalid cycle ID
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
 *         description: Cycle not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', cycleIdValidation, validateRequest, controller.getById);

/**
 * @openapi
 * /api/v1/mentorship-cycles:
 *   post:
 *     summary: Create a mentorship cycle
 *     description: Administrator only. New cycles begin in draft status.
 *     tags: [Mentorship Cycles]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateCycleRequest'
 *     responses:
 *       201:
 *         description: Cycle created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleResponse'
 *       400:
 *         description: Invalid cycle fields or date range
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
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', requireRole(ADMIN_ROLES), rejectUnexpectedFields(cycleFields), createCycleValidation, validateRequest, controller.create);

/**
 * @openapi
 * /api/v1/mentorship-cycles/{id}:
 *   patch:
 *     summary: Update a mentorship cycle
 *     tags: [Mentorship Cycles]
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
 *             $ref: '#/components/schemas/UpdateCycleRequest'
 *     responses:
 *       200:
 *         description: Cycle updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleResponse'
 *       400:
 *         description: Invalid cycle ID, fields, or date range
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
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cycle not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id', requireRole(ADMIN_ROLES), cycleIdValidation, rejectUnexpectedFields(cycleFields), updateCycleValidation, validateRequest, controller.update);

/**
 * @openapi
 * /api/v1/mentorship-cycles/{id}/status:
 *   patch:
 *     summary: Transition a mentorship cycle status
 *     description: Allowed transitions are draft to planned or cancelled, planned to active or cancelled, and active to completed or cancelled. Completed and cancelled are terminal. Activation requires start_date and end_date.
 *     tags: [Mentorship Cycles]
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
 *             $ref: '#/components/schemas/UpdateCycleStatusRequest'
 *     responses:
 *       200:
 *         description: Cycle status transitioned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleResponse'
 *       400:
 *         description: Unsupported status, invalid transition, or missing activation dates
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
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cycle not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Concurrent cycle status change
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch('/:id/status', requireRole(ADMIN_ROLES), updateCycleStatusValidation, validateRequest, controller.updateStatus);

/**
 * @openapi
 * /api/v1/mentorship-cycles/{cycleId}/facilities:
 *   get:
 *     summary: List facilities assigned to a cycle
 *     tags: [Cycle Configuration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Cycle facilities
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleFacilityListResponse'
 *       400:
 *         description: Invalid cycle ID
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
 *         description: Cycle not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     summary: Assign a facility to a cycle
 *     tags: [Cycle Configuration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignCycleFacilityRequest'
 *     responses:
 *       201:
 *         description: Facility assigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleFacilityAssignmentResponse'
 *       400:
 *         description: Invalid identifiers
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
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cycle or facility not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Facility already assigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:cycleId/facilities', cycleConfigIdValidation, validateRequest, controller.listFacilities);
router.post('/:cycleId/facilities', requireRole(ADMIN_ROLES), rejectUnexpectedFields(['facility_id']), facilityConfigValidation, validateRequest, controller.assignFacility);

/**
 * @openapi
 * /api/v1/mentorship-cycles/{cycleId}/facilities/{facilityId}:
 *   delete:
 *     summary: Remove a facility from a cycle
 *     tags: [Cycle Configuration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: path
 *         name: facilityId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Facility removed from cycle
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleFacilityAssignmentResponse'
 *       400:
 *         description: Invalid identifiers
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
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cycle or assignment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:cycleId/facilities/:facilityId', requireRole(ADMIN_ROLES), facilityConfigIdsValidation, validateRequest, controller.removeFacility);

/**
 * @openapi
 * /api/v1/mentorship-cycles/{cycleId}/thematic-areas:
 *   get:
 *     summary: List thematic areas assigned to a cycle
 *     tags: [Cycle Configuration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Cycle thematic areas
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleThematicAreaListResponse'
 *       400:
 *         description: Invalid cycle ID
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
 *         description: Cycle not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   post:
 *     summary: Assign a thematic area to a cycle
 *     tags: [Cycle Configuration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AssignCycleThematicAreaRequest'
 *     responses:
 *       201:
 *         description: Thematic area assigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleThematicAreaAssignmentResponse'
 *       400:
 *         description: Invalid identifiers
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
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cycle or thematic area not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Thematic area already assigned
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:cycleId/thematic-areas', cycleConfigIdValidation, validateRequest, controller.listThematicAreas);
router.post('/:cycleId/thematic-areas', requireRole(ADMIN_ROLES), rejectUnexpectedFields(['thematic_area_id']), thematicAreaConfigValidation, validateRequest, controller.assignThematicArea);

/**
 * @openapi
 * /api/v1/mentorship-cycles/{cycleId}/thematic-areas/{thematicAreaId}:
 *   delete:
 *     summary: Remove a thematic area from a cycle
 *     tags: [Cycle Configuration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: path
 *         name: thematicAreaId
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Thematic area removed from cycle
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CycleThematicAreaAssignmentResponse'
 *       400:
 *         description: Invalid identifiers
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
 *         description: Administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Cycle or assignment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete('/:cycleId/thematic-areas/:thematicAreaId', requireRole(ADMIN_ROLES), thematicAreaConfigIdsValidation, validateRequest, controller.removeThematicArea);

module.exports = router;
