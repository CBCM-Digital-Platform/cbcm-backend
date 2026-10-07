// src/validators/cycles.validator.js
const { body, query, param } = require('express-validator');
const CycleStatus = require('../enums/cycle-status.enum');

const cycleFields = ['name', 'start_date', 'end_date'];

const createCycleValidation = [
	body('name').trim().notEmpty().withMessage('Cycle name is required.'),
	body('start_date').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/).isISO8601({ strict: true, strictSeparator: true }).withMessage('start_date must be a valid date in YYYY-MM-DD format.'),
	body('end_date').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/).isISO8601({ strict: true, strictSeparator: true }).withMessage('end_date must be a valid date in YYYY-MM-DD format.'),
];

const updateCycleValidation = [
	body('name').optional().trim().notEmpty().withMessage('name cannot be empty.'),
	body('start_date').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/).isISO8601({ strict: true, strictSeparator: true }).withMessage('start_date must be a valid date in YYYY-MM-DD format.'),
	body('end_date').optional({ nullable: true }).matches(/^\d{4}-\d{2}-\d{2}$/).isISO8601({ strict: true, strictSeparator: true }).withMessage('end_date must be a valid date in YYYY-MM-DD format.'),
];

const cycleIdValidation = [
	param('id').isInt({ min: 1 }).withMessage('Cycle id must be a positive integer.'),
];

const cycleConfigIdValidation = [
	param('cycleId').isInt({ min: 1 }).withMessage('Cycle id must be a positive integer.'),
];

const listCyclesValidation = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.'),
	query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100.'),
	query('status').optional().isIn(Object.values(CycleStatus)).withMessage('Unsupported cycle status.'),
];

const updateCycleStatusValidation = [
	...cycleIdValidation,
	body('status').isIn(Object.values(CycleStatus)).withMessage('Unsupported cycle status.'),
];

const facilityConfigValidation = [
	...cycleConfigIdValidation,
	body('facility_id').isInt({ min: 1 }).withMessage('facility_id must be a positive integer.'),
];

const thematicAreaConfigValidation = [
	...cycleConfigIdValidation,
	body('thematic_area_id').isInt({ min: 1 }).withMessage('thematic_area_id must be a positive integer.'),
];

const facilityConfigIdsValidation = [
	...cycleConfigIdValidation,
	param('facilityId').isInt({ min: 1 }).withMessage('Facility id must be a positive integer.'),
];

const thematicAreaConfigIdsValidation = [
	...cycleConfigIdValidation,
	param('thematicAreaId').isInt({ min: 1 }).withMessage('Thematic area id must be a positive integer.'),
];

module.exports = {
	cycleFields,
	createCycleValidation,
	updateCycleValidation,
	cycleIdValidation,
	cycleConfigIdValidation,
	listCyclesValidation,
	updateCycleStatusValidation,
	facilityConfigValidation,
	thematicAreaConfigValidation,
	facilityConfigIdsValidation,
	thematicAreaConfigIdsValidation,
};
