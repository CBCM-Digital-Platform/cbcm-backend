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

router.get('/', listCyclesValidation, validateRequest, controller.list);

router.get('/:id', cycleIdValidation, validateRequest, controller.getById);

router.post('/', requireRole(ADMIN_ROLES), rejectUnexpectedFields(cycleFields), createCycleValidation, validateRequest, controller.create);

router.patch('/:id', requireRole(ADMIN_ROLES), cycleIdValidation, rejectUnexpectedFields(cycleFields), updateCycleValidation, validateRequest, controller.update);

router.patch('/:id/status', requireRole(ADMIN_ROLES), updateCycleStatusValidation, validateRequest, controller.updateStatus);

router.get('/:cycleId/facilities', cycleConfigIdValidation, validateRequest, controller.listFacilities);
router.post('/:cycleId/facilities', requireRole(ADMIN_ROLES), rejectUnexpectedFields(['facility_id']), facilityConfigValidation, validateRequest, controller.assignFacility);

router.delete('/:cycleId/facilities/:facilityId', requireRole(ADMIN_ROLES), facilityConfigIdsValidation, validateRequest, controller.removeFacility);

router.get('/:cycleId/thematic-areas', cycleConfigIdValidation, validateRequest, controller.listThematicAreas);
router.post('/:cycleId/thematic-areas', requireRole(ADMIN_ROLES), rejectUnexpectedFields(['thematic_area_id']), thematicAreaConfigValidation, validateRequest, controller.assignThematicArea);

router.delete('/:cycleId/thematic-areas/:thematicAreaId', requireRole(ADMIN_ROLES), thematicAreaConfigIdsValidation, validateRequest, controller.removeThematicArea);

module.exports = router;
