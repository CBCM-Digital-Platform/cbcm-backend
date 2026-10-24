// src/validators/progress.validator.js
const { body, param, query } = require('express-validator');

const createSnapshotValidation = [
	body('mentee_id').isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	body('facility_id').isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	body('cycle_id').isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	body('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
	body('score').isFloat({ min: 0, max: 100 }).withMessage('Score must be between 0 and 100.'),
	body('competency_level').optional().trim().isLength({ max: 50 }).withMessage('Competency level must not exceed 50 characters.'),
];

const snapshotIdValidation = [param('id').isInt({ min: 1 }).withMessage('Invalid snapshot ID.')];

const listSnapshotsValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
	query('mentee_id').optional().isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	query('facility_id').optional().isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	query('cycle_id').optional().isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	query('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
];

const summaryValidation = [
	query('facility_id').optional().isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	query('cycle_id').optional().isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	query('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
];

const userIdValidation = [param('menteeId').isInt({ min: 1 }).withMessage('Invalid mentee ID.')];

const trendsValidation = [
	query('facility_id').optional().isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	query('cycle_id').optional().isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	query('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
	query('start_date').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date.'),
	query('end_date').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date.'),
];

const menteeTrendsValidation = [
	query('start_date').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date.'),
	query('end_date').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date.'),
];

module.exports = {
	createSnapshotValidation,
	snapshotIdValidation,
	listSnapshotsValidation,
	summaryValidation,
	userIdValidation,
	trendsValidation,
	menteeTrendsValidation,
};
