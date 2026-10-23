const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/settings.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../constants/roles.constants');
const {
	faqFields,
	createFaqValidation,
	updateFaqValidation,
	faqIdValidation,
	listFaqsValidation,
	guideFields,
	createGuideValidation,
	updateGuideValidation,
	guideIdValidation,
	listGuidesValidation,
} = require('../validators/settings.validator');

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

const WRITE_ROLES = [...ADMIN_ROLES, ...FACILITY_ADMIN_ROLES];

router.use(authenticate);

// FAQ Routes
router.get('/faqs', listFaqsValidation, validateRequest, controller.listFaqs);

router.get('/faqs/:id', faqIdValidation, validateRequest, controller.getFaq);

router.post(
	'/faqs',
	requireRole(WRITE_ROLES),
	rejectUnexpectedFields(faqFields),
	createFaqValidation,
	validateRequest,
	controller.createFaq
);

router.patch(
	'/faqs/:id',
	requireRole(WRITE_ROLES),
	faqIdValidation,
	rejectUnexpectedFields(faqFields),
	updateFaqValidation,
	validateRequest,
	controller.updateFaq
);

router.delete('/faqs/:id', requireRole(WRITE_ROLES), faqIdValidation, validateRequest, controller.deleteFaq);

// Guide Routes
router.get('/guides', listGuidesValidation, validateRequest, controller.listGuides);

router.get('/guides/:id', guideIdValidation, validateRequest, controller.getGuide);

router.post(
	'/guides',
	requireRole(WRITE_ROLES),
	rejectUnexpectedFields(guideFields),
	createGuideValidation,
	validateRequest,
	controller.createGuide
);

router.patch(
	'/guides/:id',
	requireRole(WRITE_ROLES),
	guideIdValidation,
	rejectUnexpectedFields(guideFields),
	updateGuideValidation,
	validateRequest,
	controller.updateGuide
);

router.delete('/guides/:id', requireRole(WRITE_ROLES), guideIdValidation, validateRequest, controller.deleteGuide);

module.exports = router;
