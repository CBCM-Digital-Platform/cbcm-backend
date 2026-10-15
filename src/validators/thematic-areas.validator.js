// src/validators/thematic-areas.validator.js
const { body, param, query } = require('express-validator');

const createThematicAreaValidation = [
	body('code').trim().notEmpty().withMessage('Thematic area code is required.').isLength({ min: 1, max: 50 }).withMessage('Code must be between 1 and 50 characters.'),
	body('name').trim().notEmpty().withMessage('Thematic area name is required.').isLength({ min: 1, max: 255 }).withMessage('Name must be between 1 and 255 characters.'),
];

const updateThematicAreaValidation = [
	param('id').isInt({ min: 1 }).withMessage('Invalid thematic area ID.'),
	body('code').optional().trim().isLength({ min: 1, max: 50 }).withMessage('Code must be between 1 and 50 characters.'),
	body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('Name must be between 1 and 255 characters.'),
];

const thematicAreaIdValidation = [param('id').isInt({ min: 1 }).withMessage('Invalid thematic area ID.')];

const listThematicAreasValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
];

module.exports = {
	createThematicAreaValidation,
	updateThematicAreaValidation,
	thematicAreaIdValidation,
	listThematicAreasValidation,
};
