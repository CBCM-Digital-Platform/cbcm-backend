// src/validators/facilities.validator.js
const { body, query, param } = require('express-validator');

const facilityFields = ['name', 'type', 'level', 'region', 'zone', 'woreda', 'kebele', 'street_address', 'contact_info'];

const createFacilityValidation = [
	body('name').trim().notEmpty().withMessage('Facility name is required.'),
	body('type').trim().notEmpty().withMessage('Facility type is required.'),
	...['level', 'region', 'zone', 'woreda', 'kebele', 'street_address', 'contact_info']
		.map((field) => body(field).optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage(`${field} must be a string of at most 255 characters.`)),
];

const updateFacilityValidation = [
	body('name').optional().trim().isLength({ min: 1, max: 255 }).withMessage('name must be between 1 and 255 characters.'),
	body('type').optional().trim().isLength({ min: 1, max: 255 }).withMessage('type must be between 1 and 255 characters.'),
	...['level', 'region', 'zone', 'woreda', 'kebele', 'street_address', 'contact_info']
		.map((field) => body(field).optional({ nullable: true }).isString().isLength({ max: 255 }).withMessage(`${field} must be a string of at most 255 characters.`)),
];

const facilityIdValidation = [
	param('id').isInt({ min: 1 }).withMessage('Facility id must be a positive integer.'),
];

const listFacilitiesValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
	...['type', 'level', 'region', 'zone', 'woreda'].map((field) => query(field).optional().isString().isLength({ max: 255 })),
];

module.exports = {
	facilityFields,
	createFacilityValidation,
	updateFacilityValidation,
	facilityIdValidation,
	listFacilitiesValidation,
};
