const { body, param, query } = require('express-validator');
const Role = require('../enums/role.enum');

const VALID_ROLES = Object.values(Role);

const faqFields = ['category', 'question', 'answer', 'target_audience'];

const createFaqValidation = [
	body('category').optional().trim().isString().isLength({ max: 255 }).withMessage('category must be a string of at most 255 characters.'),
	body('question').trim().notEmpty().withMessage('question is required.').isString().withMessage('question must be a string.'),
	body('answer').trim().notEmpty().withMessage('answer is required.').isString().withMessage('answer must be a string.'),
	body('target_audience').optional().trim().custom((value) => {
		if (!value) return true;
		const roles = value.split(',').map((r) => r.trim());
		const invalidRoles = roles.filter((r) => r && !VALID_ROLES.includes(r));
		if (invalidRoles.length > 0) {
			throw new Error(`Invalid target_audience roles: ${invalidRoles.join(', ')}`);
		}
		return true;
	}),
];

const updateFaqValidation = [
	body('category').optional().trim().isString().isLength({ max: 255 }).withMessage('category must be a string of at most 255 characters.'),
	body('question').optional().trim().isString().withMessage('question must be a string.'),
	body('answer').optional().trim().isString().withMessage('answer must be a string.'),
	body('target_audience').optional().trim().custom((value) => {
		if (!value) return true;
		const roles = value.split(',').map((r) => r.trim());
		const invalidRoles = roles.filter((r) => r && !VALID_ROLES.includes(r));
		if (invalidRoles.length > 0) {
			throw new Error(`Invalid target_audience roles: ${invalidRoles.join(', ')}`);
		}
		return true;
	}),
];

const faqIdValidation = [
	param('id').isInt({ min: 1 }).withMessage('FAQ id must be a positive integer.'),
];

const listFaqsValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
	query('category').optional().isString().isLength({ max: 255 }).withMessage('category must be a string of at most 255 characters.'),
];

const guideFields = ['title', 'content', 'attachment_file_id', 'target_audience'];

const createGuideValidation = [
	body('title').trim().notEmpty().withMessage('title is required.').isString().withMessage('title must be a string.'),
	body('content').trim().notEmpty().withMessage('content is required.').isString().withMessage('content must be a string.'),
	body('attachment_file_id').optional().isInt({ min: 1 }).withMessage('attachment_file_id must be a positive integer.'),
	body('target_audience').optional().trim().custom((value) => {
		if (!value) return true;
		const roles = value.split(',').map((r) => r.trim());
		const invalidRoles = roles.filter((r) => r && !VALID_ROLES.includes(r));
		if (invalidRoles.length > 0) {
			throw new Error(`Invalid target_audience roles: ${invalidRoles.join(', ')}`);
		}
		return true;
	}),
];

const updateGuideValidation = [
	body('title').optional().trim().isString().withMessage('title must be a string.'),
	body('content').optional().trim().isString().withMessage('content must be a string.'),
	body('attachment_file_id').optional().isInt({ min: 1 }).withMessage('attachment_file_id must be a positive integer.'),
	body('target_audience').optional().trim().custom((value) => {
		if (!value) return true;
		const roles = value.split(',').map((r) => r.trim());
		const invalidRoles = roles.filter((r) => r && !VALID_ROLES.includes(r));
		if (invalidRoles.length > 0) {
			throw new Error(`Invalid target_audience roles: ${invalidRoles.join(', ')}`);
		}
		return true;
	}),
];

const guideIdValidation = [
	param('id').isInt({ min: 1 }).withMessage('Guide id must be a positive integer.'),
];

const listGuidesValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
];

module.exports = {
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
};
