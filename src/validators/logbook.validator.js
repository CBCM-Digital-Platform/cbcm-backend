const { body, param, query } = require('express-validator');

const createLogbookValidation = [
	body('mentee_id').isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	body('encounter_id').optional().isInt({ min: 1 }).withMessage('Encounter ID must be a positive integer.'),
	body('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
	body('procedure_type').optional().trim().isLength({ max: 255 }).withMessage('Procedure type must not exceed 255 characters.'),
	body('hours').optional().isFloat({ min: 0, max: 24 }).withMessage('Hours must be between 0 and 24.'),
	body('clinical_notes').optional().trim().isLength({ max: 5000 }).withMessage('Clinical notes must not exceed 5000 characters.'),
	body('outcome').optional().trim().isLength({ max: 1000 }).withMessage('Outcome must not exceed 1000 characters.'),
	body('goal_progress').optional().isFloat({ min: 0, max: 100 }).withMessage('Goal progress must be between 0 and 100.'),
];

const updateLogbookValidation = [
	param('id').isInt({ min: 1 }).withMessage('Invalid logbook entry ID.'),
	body('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
	body('procedure_type').optional().trim().isLength({ max: 255 }).withMessage('Procedure type must not exceed 255 characters.'),
	body('hours').optional().isFloat({ min: 0, max: 24 }).withMessage('Hours must be between 0 and 24.'),
	body('clinical_notes').optional().trim().isLength({ max: 5000 }).withMessage('Clinical notes must not exceed 5000 characters.'),
	body('outcome').optional().trim().isLength({ max: 1000 }).withMessage('Outcome must not exceed 1000 characters.'),
	body('goal_progress').optional().isFloat({ min: 0, max: 100 }).withMessage('Goal progress must be between 0 and 100.'),
	body('status').optional().isIn(['draft', 'submitted', 'cancelled']).withMessage('Invalid status.'),
];

const logbookIdValidation = [param('id').isInt({ min: 1 }).withMessage('Invalid logbook entry ID.')];

const submitLogbookValidation = [
	...logbookIdValidation,
];

const approveLogbookValidation = [logbookIdValidation];

const requestRevisionValidation = [
	...logbookIdValidation,
	body('revision_reason').trim().notEmpty().withMessage('Revision reason is required.').isLength({ max: 1000 }).withMessage('Revision reason must not exceed 1000 characters.'),
];

const listLogbookValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
	query('mentee_id').optional().isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	query('status').optional().isIn(['draft', 'submitted', 'approved', 'needs_revision', 'rejected', 'cancelled']).withMessage('Invalid status.'),
	query('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
];

const menteeIdValidation = [param('mentee_id').isInt({ min: 1 }).withMessage('Invalid mentee ID.')];

module.exports = {
	createLogbookValidation,
	updateLogbookValidation,
	submitLogbookValidation,
	logbookIdValidation,
	approveLogbookValidation,
	requestRevisionValidation,
	listLogbookValidation,
	menteeIdValidation,
};
