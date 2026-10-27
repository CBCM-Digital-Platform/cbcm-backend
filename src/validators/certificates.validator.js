const { body, param, query } = require('express-validator');

const issueCertificateValidation = [
	body('mentee_id').isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	body('cycle_id').isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	body('thematic_area_id').isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
	body('template_id').optional().isInt({ min: 1 }).withMessage('Template ID must be a positive integer.'),
];

const certificateIdValidation = [param('id').isInt({ min: 1 }).withMessage('Invalid certificate ID.')];

const eligibilityParamsValidation = [
	param('mentee_id').isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	param('cycle_id').isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	param('thematic_area_id').isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
];

const listCertificatesValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
	query('mentee_id').optional().isInt({ min: 1 }).withMessage('Mentee ID must be a positive integer.'),
	query('cycle_id').optional().isInt({ min: 1 }).withMessage('Cycle ID must be a positive integer.'),
	query('thematic_area_id').optional().isInt({ min: 1 }).withMessage('Thematic area ID must be a positive integer.'),
	query('status').optional().isIn(['issued', 'revoked']).withMessage('Invalid status.'),
];

module.exports = {
	issueCertificateValidation,
	certificateIdValidation,
	eligibilityParamsValidation,
	listCertificatesValidation,
};
