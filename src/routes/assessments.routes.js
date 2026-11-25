// src/routes/assessments.routes.js
const express = require('express');
const { validationResult } = require('express-validator');
const controller = require('../controllers/assessments.controller');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const {
	createAssessmentValidation,
	updateAssessmentValidation,
	assessmentIdValidation,
	setPreTestScoresValidation,
	setPostTestScoreValidation,
	setChecklistItemsValidation,
	addEvidenceValidation,
	reviewAssessmentValidation,
	listAssessmentsValidation,
	setPracticalResultValidation,
	practicalChecklistQueryValidation,
	practicalEvaluationValidation,
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
 *     description: Retrieves a specific assessment by ID with pre-test scores, checklist items, and evidence.
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
 *     description: Finalizes a draft or in-review assessment. Calculates aggregate score from pre-test scores.
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
 * /api/v1/assessments/{id}/pre-test-scores:
 *   post:
 *     summary: Set pre-test rubric scores (manual fallback)
 *     description: Sets or updates manually recorded pre-test rubric scores. This is a fallback for assessments without a mapped PRETEST quiz; when a pre-test quiz is configured, scores are derived from the completed quiz attempt and manual entry is rejected. Moves assessment to in_review status.
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
 *               - pre_test_scores
 *             properties:
 *               pre_test_scores:
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
 *         description: Pre-test scores set
 *       400:
 *         description: Invalid status or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.post('/:id/pre-test-scores', setPreTestScoresValidation, validateRequest, controller.setPreTestScores);

/**
 * @openapi
 * /api/v1/assessments/{id}/post-test-score:
 *   post:
 *     summary: Set post-test score (manual fallback)
 *     description: Sets or updates the post-test score manually. This is a fallback for assessments without a mapped POST_TEST quiz; when a post-test quiz is configured, the score is derived from the completed quiz attempt and manual entry is rejected. post_test_score is evaluated against the active passing rule's post_test_threshold.
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
 *               post_test_score:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 100
 *     responses:
 *       200:
 *         description: Post-test score set
 *       400:
 *         description: Invalid status or validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.post('/:id/post-test-score', setPostTestScoreValidation, validateRequest, controller.setPostTestScore);

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
 * /api/v1/assessments/{id}/sync-pre-test:
 *   post:
 *     summary: Synchronize pre-test score from quiz
 *     description: Synchronizes the pre-test result from the latest valid completed attempt within the configured attempt limit of the uniquely mapped, published, authorized PRETEST quiz for the assessment thematic area. Pre-test and post-test quizzes are distinguished by the quiz assessment_stage (PRETEST/POST_TEST); multiple mapped quizzes are rejected as ambiguous. Repeated synchronization is idempotent and replaces the prior quiz-derived pre-test result. System Admins, the assigned Mentor, and Facility Admins in the assessment facility may synchronize. In normal operation this happens automatically when the mentee completes the quiz.
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
 *         description: Pre-test synchronization result
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
 *         description: Multiple pre-test quizzes are mapped to this assessment scope
 *       422:
 *         description: No active passing rule is configured for this assessment scope
 */
router.post('/:id/sync-pre-test', assessmentIdValidation, validateRequest, controller.syncPreTest);

/**
 * @openapi
 * /api/v1/assessments/{id}/sync-post-test:
 *   post:
 *     summary: Synchronize post-test score from quiz
 *     description: Synchronizes the post-test result from the latest valid completed attempt within the configured attempt limit of the uniquely mapped, published, authorized POST_TEST quiz for the assessment thematic area. A completed post-test never overwrites the pre-test result. System Admins, the assigned Mentor, and Facility Admins in the assessment facility may synchronize. In normal operation this happens automatically when the mentee completes the quiz.
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
 *         description: Post-test synchronization result
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
 *         description: Multiple post-test quizzes are mapped to this assessment scope
 *       422:
 *         description: No active passing rule is configured for this assessment scope
 */
router.post('/:id/sync-post-test', assessmentIdValidation, validateRequest, controller.syncPostTest);

/**
 * @openapi
 * /api/v1/assessments/{id}/practical-checklist:
 *   get:
 *     summary: Get applicable practical checklists
 *     description: Returns the published practical checklist templates applicable to the assessment's thematic area (latest version per procedure). Optionally filter by procedure name. Assigned mentors, facility admins in scope, and system admins may view.
 *     tags: [Assessments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *       - in: query
 *         name: procedure
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Applicable published practical checklists
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Authorization failed
 *       404:
 *         description: Assessment not found
 */
router.get('/:id/practical-checklist', practicalChecklistQueryValidation, validateRequest, controller.getPracticalChecklist);

/**
 * @openapi
 * /api/v1/assessments/{id}/practical-evaluation:
 *   post:
 *     summary: Submit practical checklist evaluation
 *     description: The assigned mentor evaluates the mentee against a published practical checklist for the assessment's thematic area. Responses are stored per checklist item with the checklist version for traceability. Set submit=true to finalize the evaluation; all required items must then have a response. An optional overall practical_score (1-5) records the mentor's rating and is evaluated against the active passing rule's practical threshold. Saving with submit=false stores a draft evaluation that can be updated without losing prior responses.
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
 *             required: [checklist_id]
 *             properties:
 *               checklist_id:
 *                 type: integer
 *               responses:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [checklist_item_id, status]
 *                   properties:
 *                     checklist_item_id: { type: integer }
 *                     status:
 *                       type: string
 *                       enum: [performed_correctly, needs_improvement, not_observed, not_applicable]
 *                     score: { type: integer, minimum: 0, maximum: 4 }
 *                     comment: { type: string }
 *                     not_applicable_reason: { type: string }
 *               practical_score: { type: integer, minimum: 1, maximum: 5 }
 *               practical_feedback: { type: string }
 *               submit: { type: boolean, default: false }
 *     responses:
 *       200:
 *         description: Practical evaluation saved
 *       400:
 *         description: Validation error or incomplete checklist
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Only the assigned mentor can submit practical evaluations
 *       404:
 *         description: Assessment or checklist not found
 *       409:
 *         description: Checklist is not published or assessment status invalid
 *       422:
 *         description: No active passing rule configured
 */
router.post('/:id/practical-evaluation', practicalEvaluationValidation, validateRequest, controller.submitPracticalEvaluation);

/**
 * @openapi
 * /api/v1/assessments/{id}/certificate-eligibility:
 *   get:
 *     summary: Get certificate eligibility
 *     description: Returns pre-test, post-test, and practical results compared against the applicable active passing rule configured by the Super Admin (pre_test_threshold, post_test_threshold, practical_threshold), plus prerequisite and finalized/reviewed lifecycle requirements. Pre-test is diagnostic/informational only (components.pre_test.informational=true, required_for_certificate=false) and never blocks eligibility; only the post-test score and the practical score are mandatory certificate requirements. Post-test and pre-test scores are derived from completed quiz attempts. If no applicable active passing rule exists, a 422 NO_ACTIVE_PASSING_RULE error is returned instead of falling back to hardcoded thresholds. Mentors may view their mentees' assessments, mentees their own, Facility Admins assessments in their facility, and System Admins within their permitted scope.
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
