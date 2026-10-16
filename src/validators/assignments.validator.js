// src/validators/assignments.validator.js
const { body, param, query } = require('express-validator');
const AssignmentStatus = require('../enums/assignment-status.enum');

const createAssignmentValidation = [
	body('mentor_id').isInt({ min: 1 }).withMessage('Mentor ID must be a positive integer.'),
	body('mentee_id').isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	body('facility_id').isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	body('cycle_id').isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	body('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
	body('priority_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Priority score must be between 0 and 100.'),
	body('matching_reason').optional().trim().isLength({ max: 1000 }).withMessage('Matching reason must not exceed 1000 characters.'),
];

const updateAssignmentValidation = [
	param('id').isInt({ min: 1 }).withMessage('Invalid assignment ID.'),
	body('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
	body('priority_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Priority score must be between 0 and 100.'),
	body('matching_reason').optional().trim().isLength({ max: 1000 }).withMessage('Matching reason must not exceed 1000 characters.'),
];

const assignmentIdValidation = [param('id').isInt({ min: 1 }).withMessage('Invalid assignment ID.')];

const updateAssignmentStatusValidation = [
	...assignmentIdValidation,
	body('status').isIn(Object.values(AssignmentStatus)).withMessage('Invalid assignment status.'),
];

const listAssignmentsValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
	query('mentor_id').optional().isInt({ min: 1 }).withMessage('Mentor ID must be a positive integer.'),
	query('mentee_id').optional().isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	query('facility_id').optional().isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	query('cycle_id').optional().isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	query('status').optional().isIn(Object.values(AssignmentStatus)).withMessage('Invalid assignment status.'),
];

const userIdValidation = [param('id').isInt({ min: 1 }).withMessage('Invalid user ID.')];

module.exports = {
	createAssignmentValidation,
	updateAssignmentValidation,
	assignmentIdValidation,
	updateAssignmentStatusValidation,
	listAssignmentsValidation,
	userIdValidation,
};
