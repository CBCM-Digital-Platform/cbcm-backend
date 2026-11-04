// src/routes/assessments.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/assessments.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const {
	createAssessmentValidation,
	updateAssessmentValidation,
	assessmentIdValidation,
	setCriteriaScoreValidation,
	setTheoryScoreValidation,
	setChecklistItemsValidation,
	addEvidenceValidation,
	reviewAssessmentValidation,
	listAssessmentsValidation,
	setPracticalResultValidation,
} = require('../validators/assessments.validator');

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

router.use(authenticate);

/**
 * @openapi
 * /api/v1/assessments:
 *   get:
 *     summary: List assessments
 *     description: Lists assessments with authorized filters and pagination. Mentors see their mentees' assessments; Mentees see their own; Facility Admins see their facility's assessments.
 *     tags: [Assessments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: mentee_id
 *         schema: { type: integer }
 *       - in: query
 *         name: mentor_id
 *         schema: { type: integer }
 *       - in: query
 *         name: facility_id
 *         schema: { type: integer }
 *       - in: query
 *         name: cycle_id
 *         schema: { type: integer }
 *       - in: query
 *         name: thematic_area_id
 *         schema: { type: integer }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [draft, in_review, finalized, reviewed] }
 *     responses:
 *       200:
 *         description: Paginated assessments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 meta:
 *                   type: object
 *       400:
 *         description: Invalid filters
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 */
router.get('/', listAssessmentsValidation, validateRequest, controller.list);

/**
 * @openapi
 * /api/v1/assessments/{id}:
 *   get:
 *     summary: Get an assessment
 *     description: Retrieves a specific assessment by ID with criteria scores, checklist items, and evidence.
 *     tags: [Assessments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Assessment details
 *       400:
 *         description: Invalid assessment ID
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.get('/:id', assessmentIdValidation, validateRequest, controller.getById);

/**
 * @openapi
 * /api/v1/assessments:
 *   post:
 *     summary: Create an assessment
 *     description: Creates a new draft assessment for a mentee-mentor pair. Requires an active assignment.
 *     tags: [Assessments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mentee_id
 *               - mentor_id
 *               - facility_id
 *               - cycle_id
 *             properties:
 *               mentee_id:
 *                 type: integer
 *               mentor_id:
 *                 type: integer
 *               facility_id:
 *                 type: integer
 *               cycle_id:
 *                 type: integer
 *               thematic_area_id:
 *                 type: integer
 *               prerequisites_met:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Assessment created
 *       400:
 *         description: Validation error or business rule violation
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Related entity not found
 */
router.post('/', createAssessmentValidation, validateRequest, controller.create);

/**
 * @openapi
 * /api/v1/assessments/{id}:
 *   patch:
 *     summary: Update an assessment
 *     description: Updates draft or in-review assessment fields (feedback, prerequisites_met).
 *     tags: [Assessments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               feedback:
 *                 type: string
 *               prerequisites_met:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Assessment updated
 *       400:
 *         description: Invalid status or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.patch('/:id', updateAssessmentValidation, validateRequest, controller.update);

/**
 * @openapi
 * /api/v1/assessments/{id}/finalize:
 *   post:
 *     summary: Finalize an assessment
 *     description: Finalizes a draft or in-review assessment. Calculates aggregate score from criteria scores.
 *     tags: [Assessments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Assessment finalized
 *       400:
 *         description: Invalid status transition or incomplete assessment
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.post('/:id/finalize', assessmentIdValidation, validateRequest, controller.finalize);

/**
 * @openapi
 * /api/v1/assessments/{id}/review:
 *   post:
 *     summary: Review an assessment
 *     description: Reviews a finalized assessment. Admins only.
 *     tags: [Assessments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               feedback:
 *                 type: string
 *               aggregate_score:
 *                 type: number
 *     responses:
 *       200:
 *         description: Assessment reviewed
 *       400:
 *         description: Invalid status transition
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.post('/:id/review', reviewAssessmentValidation, validateRequest, controller.review);

/**
 * @openapi
 * /api/v1/assessments/{id}/criteria-scores:
 *   post:
 *     summary: Set assessment criteria scores
 *     description: Sets or updates criteria scores for an assessment. Moves assessment to in_review status.
 *     tags: [Assessments]
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
 *             required:
 *               - criteria_scores
 *             properties:
 *               criteria_scores:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     criterion:
 *                       type: string
 *                     score:
 *                       type: number
 *     responses:
 *       200:
 *         description: Criteria scores set
 *       400:
 *         description: Invalid status or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.post('/:id/criteria-scores', setCriteriaScoreValidation, validateRequest, controller.setCriteriaScore);

/**
 * @openapi
 * /api/v1/assessments/{id}/theory-score:
 *   post:
 *     summary: Set assessment theory score
 *     description: Sets or updates the theory score for an assessment. Automatically calculates theory_passed based on 80/100 threshold.
 *     tags: [Assessments]
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
 *             properties:
 *               theory_score:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Theory score set
 *       400:
 *         description: Invalid status or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.post('/:id/theory-score', setTheoryScoreValidation, validateRequest, controller.setTheoryScore);

/**
 * @openapi
 * /api/v1/assessments/{id}/checklist-items:
 *   post:
 *     summary: Set assessment checklist items
 *     description: Sets or updates checklist items for an assessment.
 *     tags: [Assessments]
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
 *             required:
 *               - checklist_items
 *             properties:
 *               checklist_items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     item:
 *                       type: string
 *                     checked:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Checklist items set
 *       400:
 *         description: Invalid status or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.post('/:id/checklist-items', setChecklistItemsValidation, validateRequest, controller.setChecklistItems);

/**
 * @openapi
 * /api/v1/assessments/{id}/evidence:
 *   post:
 *     summary: Add evidence to an assessment
 *     description: Adds evidence (file reference) to an assessment.
 *     tags: [Assessments]
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
 *             required:
 *               - title
 *               - file_id
 *             properties:
 *               title:
 *                 type: string
 *               file_id:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Evidence added
 *       400:
 *         description: Invalid status or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.post('/:id/evidence', addEvidenceValidation, validateRequest, controller.addEvidence);

/**
 * @openapi
 * /api/v1/assessments/{id}/practical-result:
 *   post:
 *     summary: Set practical assessment result
 *     description: The assigned mentor records the practical assessment result (1-5 scale) for an assessment.
 *     tags: [Assessments]
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
 *             required:
 *               - practical_score
 *             properties:
 *               practical_score:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               assessment_date:
 *                 type: string
 *                 format: date
 *               practical_feedback:
 *                 type: string
 *     responses:
 *       200:
 *         description: Practical result set
 *       400:
 *         description: Invalid status or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.post('/:id/practical-result', setPracticalResultValidation, validateRequest, controller.setPracticalResult);

/**
 * @openapi
 * /api/v1/assessments/{id}/sync-criteria:
 *   post:
 *     summary: Synchronize criteria score from quiz
 *     description: Uses the latest valid completed attempt within the configured attempt limit from the uniquely mapped, published, authorized criteria quiz for the assessment thematic area. Multiple mapped criteria quizzes are rejected as ambiguous because no aggregation rule exists. Repeated synchronization replaces the prior quiz-derived criteria result. System Admins, the assigned Mentor, and Facility Admins in the assessment facility may synchronize.
 *     tags: [Assessments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Criteria score synchronization result
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssessmentQuizSyncResponse'
 *       400:
 *         description: Assessment cannot be updated in its current state
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 *       409:
 *         description: Multiple criteria quizzes are mapped to this assessment scope
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:id/sync-criteria', assessmentIdValidation, validateRequest, controller.syncCriteriaScores);

/**
 * @openapi
 * /api/v1/assessments/{id}/sync-theory:
 *   post:
 *     summary: Sync theory score from quiz
 *     description: Synchronizes the theory score from the latest valid completed attempt within the configured attempt limit from the uniquely mapped, published, authorized theory quiz for the assessment thematic area. System Admins, the assigned Mentor, and Facility Admins in the assessment facility may synchronize.
 *     tags: [Assessments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Theory score synced
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssessmentQuizSyncResponse'
 *       400:
 *         description: Sync failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 *       409:
 *         description: Multiple theory quizzes are mapped to this assessment scope
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/:id/sync-theory', assessmentIdValidation, validateRequest, controller.syncTheoryScore);

/**
 * @openapi
 * /api/v1/assessments/{id}/certificate-eligibility:
 *   get:
 *     summary: Get certificate eligibility
 *     description: Returns criteria-quiz, theory-quiz, and practical results against configured passing thresholds, plus prerequisite and finalized/reviewed lifecycle requirements. Mentors may view their mentees' assessments, mentees their own, Facility Admins assessments in their facility, and System Admins within their permitted scope.
 *     tags: [Assessments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Certificate eligibility details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AssessmentEligibilityResponse'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.get('/:id/certificate-eligibility', assessmentIdValidation, validateRequest, controller.getCertificateEligibility);

module.exports = router;
