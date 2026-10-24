// src/validators/activity-logs.validator.js
const { body, param, query } = require('express-validator');

const logIdValidation = [param('id').isInt({ min: 1 }).withMessage('Invalid activity log ID.')];

const listLogsValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
	query('actor_id').optional().isInt({ min: 1 }).withMessage('Actor ID must be a positive integer.'),
	query('facility_id').optional().isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	query('action').optional().trim().isLength({ max: 100 }).withMessage('Action must not exceed 100 characters.'),
	query('entity_type').optional().trim().isLength({ max: 50 }).withMessage('Entity type must not exceed 50 characters.'),
	query('entity_id').optional().isInt({ min: 1 }).withMessage('Entity ID must be a positive integer.'),
	query('outcome').optional().isIn(['success', 'failure', 'denied']).withMessage('Outcome must be success, failure, or denied.'),
	query('start_date').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date.'),
	query('end_date').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date.'),
];

module.exports = {
	logIdValidation,
	listLogsValidation,
};
