const { body, checkExact, param, query } = require('express-validator');
const NewsStatus = require('../enums/news-status.enum');

const noHtmlMarkup = (value) => !/<[^>]*>/.test(value);

function exactBody(rules) {
	return [...rules, checkExact(rules, { locations: ['body'] })];
}

function exactQuery(rules) {
	return [...rules, checkExact(rules, { locations: ['query'] })];
}

const createRules = [
	body('title').isString().withMessage('Title is required.').bail().trim()
		.isLength({ min: 3, max: 200 }).withMessage('Title must be between 3 and 200 characters.')
		.bail().custom(noHtmlMarkup).withMessage('Title must not contain HTML markup.'),
	body('summary').optional({ values: 'null' }).isString().bail().trim()
		.isLength({ max: 300 }).withMessage('Summary must be at most 300 characters.')
		.bail().custom(noHtmlMarkup).withMessage('Summary must not contain HTML markup.'),
	body('content').optional({ values: 'null' }).isString().bail()
		.custom(noHtmlMarkup).withMessage('Content must not contain HTML markup.'),
	body('cover_image_url').optional({ values: 'null' }).isURL({
		protocols: ['http', 'https'],
		require_protocol: true,
		require_tld: false,
	}).withMessage('Cover image URL must be an HTTP or HTTPS URL.'),
	body('category').optional({ values: 'null' }).isString().bail().trim()
		.isLength({ min: 1, max: 50 }).withMessage('Category must be between 1 and 50 characters.'),
	body('status').optional().isIn(NewsStatus.VALUES).withMessage('Status must be draft, published, or archived.'),
	body('published_at').optional({ values: 'null' }).isISO8601({ strict: true, strictSeparator: true })
		.withMessage('Published date must be a valid ISO 8601 date.').bail().toDate(),
];

const updateRules = [
	body('title').optional().isString().bail().trim()
		.isLength({ min: 3, max: 200 }).withMessage('Title must be between 3 and 200 characters.')
		.bail().custom(noHtmlMarkup).withMessage('Title must not contain HTML markup.'),
	...createRules.slice(1),
];

const publicListRules = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.').bail().toInt(),
	query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50.').bail().toInt(),
	query('category').optional().isString().bail().trim().isLength({ min: 1, max: 50 })
		.withMessage('Category must be between 1 and 50 characters.'),
];

const adminListRules = [
	query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer.').bail().toInt(),
	query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50.').bail().toInt(),
	query('status').optional().isIn(NewsStatus.VALUES).withMessage('Status must be draft, published, or archived.'),
	query('search').optional().isString().bail().trim().isLength({ max: 200 })
		.withMessage('Search must be at most 200 characters.'),
];

module.exports = {
	createNewsValidation: exactBody(createRules),
	updateNewsValidation: exactBody(updateRules),
	newsIdValidation: [param('id').isInt({ min: 1 }).withMessage('News ID must be a positive integer.').bail().toInt()],
	newsIdentifierValidation: [param('idOrSlug').trim().isLength({ min: 1, max: 200 }).withMessage('News identifier is invalid.')],
	publicNewsListValidation: exactQuery(publicListRules),
	adminNewsListValidation: exactQuery(adminListRules),
};
