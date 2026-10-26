const express = require('express');
const router = express.Router();
const controller = require('../controllers/certificates.controller');
const validator = require('../validators/certificates.validator');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/authorization');

// All certificate routes require authentication
router.use(authenticate);

// Check eligibility (admin/facility admin only)
router.get(
	'/eligibility/:mentee_id/:cycle_id/:thematic_area_id',
	requireRole(['admin', 'facility_admin']),
	validator.eligibilityParamsValidation,
	controller.checkEligibility
);

// List certificates (admin/facility admin/mentee can view)
router.get(
	'/',
	requireRole(['admin', 'facility_admin', 'mentee']),
	validator.listCertificatesValidation,
	controller.listCertificates
);

// Get single certificate
router.get(
	'/:id',
	requireRole(['admin', 'facility_admin', 'mentee']),
	validator.certificateIdValidation,
	controller.getCertificate
);

// Issue certificate (admin/facility admin only)
router.post(
	'/',
	requireRole(['admin', 'facility_admin']),
	validator.issueCertificateValidation,
	controller.issueCertificate
);

// Revoke certificate (admin/facility admin only)
router.delete(
	'/:id',
	requireRole(['admin', 'facility_admin']),
	validator.certificateIdValidation,
	controller.revokeCertificate
);

module.exports = router;
