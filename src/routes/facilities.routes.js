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

router.get('/', listFacilitiesValidation, validateRequest, controller.list);

router.get('/:id', facilityIdValidation, validateRequest, controller.getById);

router.post(
	'/',
	requireRole(ADMIN_ROLES),
	rejectUnexpectedFields(facilityFields),
	createFacilityValidation,
	validateRequest,
	controller.create
);

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
