// src/validators/matching.validator.js
const { body } = require('express-validator');

const findMatchesValidation = [
	body('cycle_id').isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	body('facility_id').isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	body('mentee_id').optional().isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	body('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
];

module.exports = {
	findMatchesValidation,
};
