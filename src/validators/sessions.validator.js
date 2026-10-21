const { body, param, query } = require('express-validator');
const SessionStatus = require('../enums/session-status.enum');
const EncounterMode = require('../enums/encounter-mode.enum');

const createSessionValidation = [
	body('assignment_id').isInt({ min: 1 }).withMessage('Assignment ID must be a positive integer.'),
	body('mode').isIn(Object.values(EncounterMode)).withMessage('Invalid session mode. Must be in_person, virtual, or hybrid.'),
	body('scheduled_at').optional().isISO8601().withMessage('Scheduled time must be a valid ISO 8601 date.'),
	body('duration_minutes').optional().isInt({ min: 5, max: 180 }).withMessage('Duration must be between 5 and 180 minutes.'),
	body('clinical_setting').optional().trim().isLength({ max: 255 }).withMessage('Clinical setting must not exceed 255 characters.'),
	body('location').optional().trim().isLength({ max: 255 }).withMessage('Location must not exceed 255 characters.'),
	body('session_goals').optional().trim().isLength({ max: 2000 }).withMessage('Session goals must not exceed 2000 characters.'),
	body('preparation_notes').optional().trim().isLength({ max: 2000 }).withMessage('Preparation notes must not exceed 2000 characters.'),
	body('status').optional().isIn(Object.values(SessionStatus)).withMessage('Invalid session status.'),
];

const updateSessionValidation = [
	param('id').isInt({ min: 1 }).withMessage('Invalid session ID.'),
	body('mode').optional().isIn(Object.values(EncounterMode)).withMessage('Invalid session mode.'),
	body('scheduled_at').optional().isISO8601().withMessage('Scheduled time must be a valid ISO 8601 date.'),
	body('duration_minutes').optional().isInt({ min: 5, max: 180 }).withMessage('Duration must be between 5 and 180 minutes.'),
	body('clinical_setting').optional().trim().isLength({ max: 255 }).withMessage('Clinical setting must not exceed 255 characters.'),
	body('location').optional().trim().isLength({ max: 255 }).withMessage('Location must not exceed 255 characters.'),
	body('session_goals').optional().trim().isLength({ max: 2000 }).withMessage('Session goals must not exceed 2000 characters.'),
	body('preparation_notes').optional().trim().isLength({ max: 2000 }).withMessage('Preparation notes must not exceed 2000 characters.'),
	body('status').optional().isIn(Object.values(SessionStatus)).withMessage('Invalid session status.'),
];

const sessionIdValidation = [param('id').isInt({ min: 1 }).withMessage('Invalid session ID.')];

const updateStatusValidation = [
	...sessionIdValidation,
	body('status').isIn(Object.values(SessionStatus)).withMessage('Invalid session status.'),
];

const listSessionsValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
	query('status').optional().isIn(Object.values(SessionStatus)).withMessage('Invalid session status.'),
	query('mode').optional().isIn(Object.values(EncounterMode)).withMessage('Invalid session mode.'),
	query('mentor_id').optional().isInt({ min: 1 }).withMessage('Mentor ID must be a positive integer.'),
	query('mentee_id').optional().isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	query('facility_id').optional().isInt({ min: 1 }).withMessage('Facility ID must be a positive integer.'),
	query('assignment_id').optional().isInt({ min: 1 }).withMessage('Assignment ID must be a positive integer.'),
	query('start_date').optional().isISO8601().withMessage('start_date must be a valid ISO 8601 date.'),
	query('end_date').optional().isISO8601().withMessage('end_date must be a valid ISO 8601 date.'),
	query('start_date').custom((value, { req }) => {
		if (value && req.query.end_date && new Date(value) > new Date(req.query.end_date)) {
			throw new Error('start_date must be less than or equal to end_date.');
		}
		return true;
	}),
];

const createNoteValidation = [
	...sessionIdValidation,
	body('note').trim().notEmpty().withMessage('Note content is required.').isLength({ max: 5000 }).withMessage('Note must not exceed 5000 characters.'),
];

const availableTimesValidation = [
	query('assignment_id').isInt({ min: 1 }).withMessage('Assignment ID must be a positive integer.'),
	query('date').isISO8601().withMessage('Date must be a valid ISO 8601 date.'),
	query('duration_minutes').optional().isInt({ min: 5, max: 180 }).withMessage('Duration must be between 5 and 180 minutes.'),
];

module.exports = {
	createSessionValidation,
	updateSessionValidation,
	sessionIdValidation,
	updateStatusValidation,
	listSessionsValidation,
	createNoteValidation,
	availableTimesValidation,
};