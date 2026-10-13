// src/routes/facilities.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/facilities.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { ADMIN_ROLES, FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');
const {
	facilityFields,
	createFacilityValidation,
	updateFacilityValidation,
	facilityIdValidation,
	listFacilitiesValidation,
} = require('../validators/facilities.validator');

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
 * /api/v1/facilities:
 *   get:
 *     summary: List facilities
 *     description: Lists facilities with optional geography/type filters and pagination. Any authenticated user may view facilities.
 *     tags: [Facilities]
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
 *         name: type
 *         schema: { type: string }
 *       - in: query
 *         name: level
 *         schema: { type: string }
 *       - in: query
 *         name: region
 *         schema: { type: string }
 *       - in: query
 *         name: zone
 *         schema: { type: string }
 *       - in: query
 *         name: woreda
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Paginated facilities
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FacilityListResponse'
 *       400:
 *         description: Invalid pagination or filter
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
router.get('/', listFacilitiesValidation, validateRequest, controller.list);

/**
 * @openapi
 * /api/v1/facilities/{id}:
 *   get:
 *     summary: Get a facility
 *     tags: [Facilities]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Facility details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FacilityResponse'
 *       400:
 *         description: Invalid facility ID
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
 *         description: Facility not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/:id', facilityIdValidation, validateRequest, controller.getById);

/**
 * @openapi
 * /api/v1/facilities:
 *   post:
 *     summary: Create a facility
 *     description: Administrator only. Facility fields match the existing facilities table; name and type are required by the API.
 *     tags: [Facilities]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateFacilityRequest'
 *     responses:
 *       201:
 *         description: Facility created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FacilityResponse'
 *       400:
 *         description: Invalid facility fields
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
router.post(
	'/',
	requireRole(ADMIN_ROLES),
	rejectUnexpectedFields(facilityFields),
	createFacilityValidation,
	validateRequest,
	controller.create
);

/**
 * @openapi
 * /api/v1/facilities/{id}:
 *   patch:
 *     summary: Update a facility
 *     description: Administrator only. Status updates are not available because the existing facility schema has no status field.
 *     tags: [Facilities]
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
 *             $ref: '#/components/schemas/UpdateFacilityRequest'
 *     responses:
 *       200:
 *         description: Facility updated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FacilityResponse'
 *       400:
 *         description: Invalid facility ID or fields
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
 *         description: Facility not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.patch(
	'/:id',
	requireRole(ADMIN_ROLES),
	facilityIdValidation,
	rejectUnexpectedFields(facilityFields),
	updateFacilityValidation,
	validateRequest,
	controller.update
);

module.exports = router;
