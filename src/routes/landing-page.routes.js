const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/landing-page.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const { updateLandingPageValidation } = require('../validators/landing-page.validator');

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

router.get('/', controller.getPublic);
router.get('/admin', authenticate, requireRole(SYSTEM_ADMIN_ROLES), controller.getAdmin);
router.patch(
	'/admin',
	authenticate,
	requireRole(SYSTEM_ADMIN_ROLES),
	updateLandingPageValidation,
	validateRequest,
	controller.updateAdmin
);

module.exports = router;
