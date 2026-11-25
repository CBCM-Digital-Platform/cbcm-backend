const { body, param, query } = require('express-validator');

const checklistIdValidation = [
	param('id').isInt({ min: 1 }).withMessage('Checklist ID must be a positive integer.').toInt(),
];

const checklistItemValidator = [
	body('items').optional().isArray().withMessage('items must be an array.'),
	body('items.*.item_text').optional().trim().notEmpty().withMessage('Each checklist item must have non-empty item_text.'),
	body('items.*.text').optional().trim().notEmpty().withMessage('Each checklist item must have non-empty text.'),
	body('items.*.item').optional().trim().notEmpty().withMessage('Each checklist item must have non-empty item.'),
	body('items.*.is_required').optional().isBoolean().withMessage('is_required must be a boolean.').toBoolean(),
	body('items.*.is_critical').optional().isBoolean().withMessage('is_critical must be a boolean.').toBoolean(),
];

const createChecklistValidation = [
	body('thematic_area_id').isInt({ min: 1 }).withMessage('thematic_area_id must be a positive integer.').toInt(),
	body('procedure').trim().notEmpty().isLength({ max: 255 }).withMessage('procedure is required (max 255 characters).'),
	body('title').trim().notEmpty().isLength({ max: 255 }).withMessage('title is required (max 255 characters).'),
	body('description').optional({ nullable: true }).isString().isLength({ max: 5000 }).withMessage('description must be a string up to 5000 characters.'),
	body('reference_file_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('reference_file_id must be a positive integer.').toInt(),
	...checklistItemValidator,
];

const updateChecklistValidation = [
	...checklistIdValidation,
	body('thematic_area_id').optional().isInt({ min: 1 }).withMessage('thematic_area_id must be a positive integer.').toInt(),
	body('procedure').optional().trim().notEmpty().isLength({ max: 255 }).withMessage('procedure must be non-empty (max 255 characters).'),
	body('title').optional().trim().notEmpty().isLength({ max: 255 }).withMessage('title must be non-empty (max 255 characters).'),
	body('description').optional({ nullable: true }).isString().isLength({ max: 5000 }).withMessage('description must be a string up to 5000 characters.'),
	body('reference_file_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('reference_file_id must be a positive integer.').toInt(),
	...checklistItemValidator,
];

const listChecklistsValidation = [
	query('thematic_area_id').optional().isInt({ min: 1 }).withMessage('thematic_area_id must be a positive integer.').toInt(),
	query('procedure').optional().isString().isLength({ max: 255 }).withMessage('procedure must be a string up to 255 characters.'),
	query('status').optional().isIn(['draft', 'published', 'archived']).withMessage('status must be draft, published, or archived.'),
	query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer.').toInt(),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100.').toInt(),
];

const publishChecklistValidation = checklistIdValidation;
const archiveChecklistValidation = checklistIdValidation;

module.exports = {
	checklistIdValidation,
	createChecklistValidation,
	updateChecklistValidation,
	listChecklistsValidation,
	publishChecklistValidation,
	archiveChecklistValidation,
};
