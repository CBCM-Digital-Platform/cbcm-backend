const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/assessment-passing-rules.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const Role = require('../enums/role.enum');
const {
	passingRuleIdValidation,
	listPassingRulesValidation,
	passingRuleCreateValidation,
	passingRuleUpdateValidation,
} = require('../validators/assessment-passing-rules.validator');

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

router.get('/', listPassingRulesValidation, validateRequest, requireRole([Role.ADMIN, Role.FACILITY_ADMIN]), controller.list);
router.get('/:id', passingRuleIdValidation, validateRequest, requireRole([Role.ADMIN, Role.FACILITY_ADMIN]), controller.getById);
router.post('/', passingRuleCreateValidation, validateRequest, requireRole(Role.ADMIN), controller.create);
router.patch('/:id', passingRuleUpdateValidation, validateRequest, requireRole(Role.ADMIN), controller.update);
router.delete('/:id', passingRuleIdValidation, validateRequest, requireRole(Role.ADMIN), controller.remove);

module.exports = router;
