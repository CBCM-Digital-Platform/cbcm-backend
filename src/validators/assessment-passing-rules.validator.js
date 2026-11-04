const { body, param, query } = require('express-validator');

const passingRuleIdValidation = [
	param('id').isInt({ min: 1 }).withMessage('Passing rule ID must be a positive integer.').toInt(),
];

const listPassingRulesValidation = [
	query('cycle_id').optional().isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.').toInt(),
	query('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.').toInt(),
	query('is_active').optional().isIn(['true', 'false']).withMessage('is_active must be true or false.').toBoolean(),
];

const passingRuleCreateValidation = [
	body('cycle_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.').toInt(),
	body('thematic_area_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.').toInt(),
	body('criteria_min_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Criteria minimum score must be between 0 and 100.').toFloat(),
	body('theory_min_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Theory minimum score must be between 0 and 100.').toFloat(),
	body('practical_min_score').optional().isInt({ min: 1, max: 5 }).withMessage('Practical minimum score must be an integer between 1 and 5.').toInt(),
];

const passingRuleUpdateValidation = [
	...passingRuleIdValidation,
	body('cycle_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.').toInt(),
	body('thematic_area_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.').toInt(),
	body('criteria_min_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Criteria minimum score must be between 0 and 100.').toFloat(),
	body('theory_min_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Theory minimum score must be between 0 and 100.').toFloat(),
	body('practical_min_score').optional().isInt({ min: 1, max: 5 }).withMessage('Practical minimum score must be an integer between 1 and 5.').toInt(),
	body('is_active').optional().isBoolean().withMessage('is_active must be a boolean.').toBoolean(),
];

module.exports = {
	passingRuleIdValidation,
	listPassingRulesValidation,
	passingRuleCreateValidation,
	passingRuleUpdateValidation,
};
