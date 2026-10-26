// src/validators/assessments.validator.js
const { body, param, query } = require('express-validator');
const AssessmentStatus = require('../enums/assessment-status.enum');

const createAssessmentValidation = [
	body('mentee_id').isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	body('mentor_id').isInt({ min: 1 }).withMessage('Mentor ID must be a positive integer.'),
	body('facility_id').isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	body('cycle_id').isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	body('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
	body('prerequisites_met').optional().isBoolean().withMessage('Prerequisites met must be a boolean.'),
];

const updateAssessmentValidation = [
	param('id').isInt({ min: 1 }).withMessage('Invalid assessment ID.'),
	body('feedback').optional().trim().isLength({ max: 5000 }).withMessage('Feedback must not exceed 5000 characters.'),
	body('prerequisites_met').optional().isBoolean().withMessage('Prerequisites met must be a boolean.'),
];

const assessmentIdValidation = [param('id').isInt({ min: 1 }).withMessage('Invalid assessment ID.')];

const setCriteriaScoreValidation = [
	...assessmentIdValidation,
	body('criteria_scores').isArray({ min: 1 }).withMessage('Criteria scores must be a non-empty array.'),
	body('criteria_scores.*.criterion').trim().notEmpty().withMessage('Each criterion must have a non-empty value.'),
	body('criteria_scores.*.score').optional().isFloat({ min: 0, max: 100 }).withMessage('Score must be between 0 and 100.'),
];

const setChecklistItemsValidation = [
	...assessmentIdValidation,
	body('checklist_items').isArray().withMessage('Checklist items must be an array.'),
	body('checklist_items.*.item').trim().notEmpty().withMessage('Each checklist item must have a non-empty value.'),
	body('checklist_items.*.checked').isBoolean().withMessage('Each checklist item must have a boolean checked value.'),
	body('checklist_items.*.score').optional().isInt({ min: 0, max: 4 }).withMessage('Score must be an integer between 0 and 4.'),
	body('checklist_items.*.required').optional().isBoolean().withMessage('Required must be a boolean.'),
];

const addEvidenceValidation = [
	...assessmentIdValidation,
	body('title').trim().notEmpty().withMessage('Evidence must have a non-empty title.'),
	body('file_id').isInt({ min: 1 }).withMessage('File ID must be a positive integer.'),
];

const reviewAssessmentValidation = [
	...assessmentIdValidation,
	body('feedback').optional().trim().isLength({ max: 5000 }).withMessage('Feedback must not exceed 5000 characters.'),
	body('aggregate_score').optional().isFloat({ min: 0, max: 100 }).withMessage('Aggregate score must be between 0 and 100.'),
];

const listAssessmentsValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
	query('mentee_id').optional().isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	query('mentor_id').optional().isInt({ min: 1 }).withMessage('Mentor ID must be a positive integer.'),
	query('facility_id').optional().isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	query('cycle_id').optional().isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	query('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
	query('status').optional().isIn(Object.values(AssessmentStatus)).withMessage('Invalid assessment status.'),
];

module.exports = {
	createAssessmentValidation,
	updateAssessmentValidation,
	assessmentIdValidation,
	setCriteriaScoreValidation,
	setChecklistItemsValidation,
	addEvidenceValidation,
	reviewAssessmentValidation,
	listAssessmentsValidation,
};
