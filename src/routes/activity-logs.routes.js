// src/routes/activity-logs.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/activity-logs.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { FACILITY_MANAGEMENT_ROLES } = require('../constants/roles.constants');
const { logIdValidation, listLogsValidation } = require('../validators/activity-logs.validator');

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

router.get('/', listLogsValidation, validateRequest, controller.list);
router.get('/:id', logIdValidation, validateRequest, controller.getById);

module.exports = router;
