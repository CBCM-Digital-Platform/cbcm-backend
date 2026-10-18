// src/routes/cycles.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/cycles.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const requireFacilityScope = require('../middlewares/auth/require-facility-scope.middleware');
const { FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');
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

router.get('/', listCyclesValidation, validateRequest, controller.list);

router.get('/:id', cycleIdValidation, validateRequest, controller.getById);

/**
 * @openapi
 * /api/v1/mentorship-cycles:
 *   post:
 *     summary: Create a mentorship cycle
 *     description: Available to system and facility administrators. New cycles begin in draft status.
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
 *         description: System administrator or facility administrator role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/', requireRole(FACILITY_MANAGEMENT_ROLES), rejectUnexpectedFields(cycleFields), createCycleValidation, validateRequest, controller.create);

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
 *         description: System administrator or facility administrator role required
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
router.patch('/:id', requireRole(FACILITY_MANAGEMENT_ROLES), cycleIdValidation, rejectUnexpectedFields(cycleFields), updateCycleValidation, validateRequest, controller.update);

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
 *         description: System administrator or facility administrator role required
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
router.patch('/:id/status', requireRole(FACILITY_MANAGEMENT_ROLES), updateCycleStatusValidation, validateRequest, controller.updateStatus);


router.get('/:cycleId/facilities', cycleConfigIdValidation, validateRequest, controller.listFacilities);
router.post('/:cycleId/facilities', requireRole(FACILITY_MANAGEMENT_ROLES), requireFacilityScope, rejectUnexpectedFields(['facility_id']), facilityConfigValidation, validateRequest, controller.assignFacility);

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
 *         description: System administrator role or facility administrator with access to the facility required
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
router.delete('/:cycleId/facilities/:facilityId', requireRole(FACILITY_MANAGEMENT_ROLES), facilityConfigIdsValidation, validateRequest, controller.removeFacility);

router.get('/:cycleId/thematic-areas', cycleConfigIdValidation, validateRequest, controller.listThematicAreas);
router.post('/:cycleId/thematic-areas', requireRole(FACILITY_MANAGEMENT_ROLES), rejectUnexpectedFields(['thematic_area_id']), thematicAreaConfigValidation, validateRequest, controller.assignThematicArea);

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
 *         description: System administrator or facility administrator role required
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
router.delete('/:cycleId/thematic-areas/:thematicAreaId', requireRole(FACILITY_MANAGEMENT_ROLES), thematicAreaConfigIdsValidation, validateRequest, controller.removeThematicArea);

module.exports = router;
