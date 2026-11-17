const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/news.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const {
	createNewsValidation,
	updateNewsValidation,
	newsIdValidation,
	newsIdentifierValidation,
	publicNewsListValidation,
	adminNewsListValidation,
} = require('../validators/news.validator');

const router = express.Router();

function validateRequest(req, res, next) {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		return res.status(400).json({
			success: false,
			error: {
				code: 'VALIDATION_ERROR',
				message: 'Request validation failed.',
				details: errors.array().map((error) => error.msg),
			},
		});
	}
	return next();
}

/**
 * @openapi
 * /api/v1/news:
 *   get:
 *     summary: List published news
 *     description: Returns public fields for articles published by the current time. No authentication is required.
 *     tags: [News]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *       - in: query
 *         name: category
 *         schema: { type: string, maxLength: 50 }
 *     responses:
 *       200:
 *         description: Paginated public news cards
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: integer }
 *                           title: { type: string }
 *                           slug: { type: string }
 *                           summary: { type: string, nullable: true }
 *                           cover_image_url: { type: string, nullable: true }
 *                           category: { type: string, nullable: true }
 *                           published_at: { type: string, format: date-time }
 *                     total: { type: integer }
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     totalPages: { type: integer }
 *       400:
 *         description: Invalid query parameters
 */
router.get('/', publicNewsListValidation, validateRequest, controller.listPublic);

/**
 * @openapi
 * /api/v1/news/admin:
 *   get:
 *     summary: List news for administration
 *     description: Super Admin only. Lists all news statuses with optional status and title search filters.
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 10 }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, published, archived] }
 *       - in: query
 *         name: search
 *         schema: { type: string, maxLength: 200 }
 *     responses:
 *       200:
 *         description: Paginated news records
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super Admin role required
 */
router.get('/admin', authenticate, requireRole(SYSTEM_ADMIN_ROLES), adminNewsListValidation, validateRequest, controller.listAdmin);

/**
 * @openapi
 * /api/v1/news/{id}:
 *   get:
 *     summary: Get a published news article
 *     description: Returns a public article by numeric ID or slug. Draft, archived, and scheduled articles return 404. No authentication is required.
 *     tags: [News]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Published news article with content
 *       404:
 *         description: Article is not publicly available
 */
router.get('/:idOrSlug', newsIdentifierValidation, validateRequest, controller.getPublic);

/**
 * @openapi
 * /api/v1/news:
 *   post:
 *     summary: Create a news article
 *     description: Super Admin only. Creates a draft unless a status is supplied; author is taken from the authenticated user.
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             additionalProperties: false
 *             properties:
 *               title: { type: string, minLength: 3, maxLength: 200 }
 *               summary: { type: string, maxLength: 300, nullable: true }
 *               content: { type: string, description: Plain text or Markdown; HTML is rejected. }
 *               cover_image_url: { type: string, format: uri, nullable: true }
 *               category: { type: string, maxLength: 50, nullable: true }
 *               status: { type: string, enum: [draft, published, archived], default: draft }
 *               published_at: { type: string, format: date-time, nullable: true }
 *     responses:
 *       201:
 *         description: News article created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super Admin role required
 */
router.post('/', authenticate, requireRole(SYSTEM_ADMIN_ROLES), createNewsValidation, validateRequest, controller.create);

/**
 * @openapi
 * /api/v1/news/{id}:
 *   patch:
 *     summary: Update a news article
 *     description: Super Admin only. Updates article fields or changes its status to draft, published, or archived.
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             properties:
 *               title: { type: string, minLength: 3, maxLength: 200 }
 *               summary: { type: string, maxLength: 300, nullable: true }
 *               content: { type: string, description: Plain text or Markdown; HTML is rejected. }
 *               cover_image_url: { type: string, format: uri, nullable: true }
 *               category: { type: string, maxLength: 50, nullable: true }
 *               status: { type: string, enum: [draft, published, archived] }
 *               published_at: { type: string, format: date-time, nullable: true }
 *     responses:
 *       200:
 *         description: News article updated
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super Admin role required
 *       404:
 *         description: News article not found
 */
router.patch('/:id', authenticate, requireRole(SYSTEM_ADMIN_ROLES), newsIdValidation, updateNewsValidation, validateRequest, controller.update);

/**
 * @openapi
 * /api/v1/news/{id}:
 *   delete:
 *     summary: Delete a news article
 *     description: Super Admin only. Permanently deletes a news article.
 *     tags: [News]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: News article deleted
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Super Admin role required
 *       404:
 *         description: News article not found
 */
router.delete('/:id', authenticate, requireRole(SYSTEM_ADMIN_ROLES), newsIdValidation, validateRequest, controller.destroy);

module.exports = router;
