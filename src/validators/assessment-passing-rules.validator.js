const { body, param, query } = require('express-validator');

const passingRuleIdValidation = [
	param('id').isInt({ min: 1 }).withMessage('Passing rule ID must be a positive integer.').toInt(),
];

const listPassingRulesValidation = [
	query('cycle_id').optional().isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.').toInt(),
	query('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.').toInt(),
	query('is_active').optional().isIn(['true', 'false']).withMessage('is_active must be true or false.').toBoolean(),
];

// Canonical fields are pre_test_threshold / post_test_threshold /
// practical_threshold. Legacy names (criteria_min_score, theory_min_score,
// practical_min_score and their *_min_score variants) remain accepted for
// backward compatibility and are normalized by the service.
const thresholdValidators = [
	body('pre_test_threshold').optional().isFloat({ min: 0, max: 100 }).withMessage('Pre-test threshold must be between 0 and 100.').toFloat(),
	body('post_test_threshold').optional().isFloat({ min: 0, max: 100 }).withMessage('Post-test threshold must be between 0 and 100.').toFloat(),
	body('practical_threshold').optional().isInt({ min: 1, max: 5 }).withMessage('Practical threshold must be an integer between 1 and 5.').toInt(),
	body('pre_test_min_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Pre-test minimum score must be between 0 and 100.').toFloat(),
	body('post_test_min_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Post-test minimum score must be between 0 and 100.').toFloat(),
	body('criteria_min_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Pre-test threshold (criteria_min_score) must be between 0 and 100.').toFloat(),
	body('theory_min_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Post-test threshold (theory_min_score) must be between 0 and 100.').toFloat(),
	body('practical_min_score').optional().isInt({ min: 1, max: 5 }).withMessage('Practical threshold (practical_min_score) must be an integer between 1 and 5.').toInt(),
];

const passingRuleCreateValidation = [
	body('cycle_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.').toInt(),
	body('thematic_area_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.').toInt(),
	...thresholdValidators,
];

const passingRuleUpdateValidation = [
	...passingRuleIdValidation,
	body('cycle_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.').toInt(),
	body('thematic_area_id').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.').toInt(),
	...thresholdValidators,
	body('is_active').optional().isBoolean().withMessage('is_active must be a boolean.').toBoolean(),
];

module.exports = {
	passingRuleIdValidation,
	listPassingRulesValidation,
	passingRuleCreateValidation,
	passingRuleUpdateValidation,
};
