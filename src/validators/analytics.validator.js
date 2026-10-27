// src/validators/analytics.validator.js
const { query } = require('express-validator');

const activitySummaryValidation = [
	query('start_date').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date.'),
	query('end_date').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date.'),
];

module.exports = {
	activitySummaryValidation,
};
