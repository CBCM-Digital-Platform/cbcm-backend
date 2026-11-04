const { successResponse } = require('../utils/response.util');
const controllerError = require('../utils/controller-error.util');
const service = require('../services/certificates.service');

async function checkEligibility(req, res) {
	try {
		const { mentee_id, cycle_id, thematic_area_id } = req.params;
		console.log('DEBUG cert checkEligibility start', mentee_id, cycle_id, thematic_area_id);
		const result = await service.checkEligibility(
			Number(mentee_id),
			Number(cycle_id),
			Number(thematic_area_id),
			req.user
		);
		console.log('DEBUG cert checkEligibility result', result);
		return successResponse(res, 200, result);
	} catch (error) {
		console.log('DEBUG cert checkEligibility error', error && error.message);
		return controllerError(res, error, 'Unable to check eligibility.');
	}
}

async function issueCertificate(req, res) {
	try {
		const certificate = await service.issueCertificate(req.body, req.user);
		return successResponse(res, 201, certificate);
	} catch (error) {
		return controllerError(res, error, 'Unable to issue certificate.');
	}
}

async function listCertificates(req, res) {
	try {
		const filters = {
			mentee_id: req.query.mentee_id ? Number(req.query.mentee_id) : undefined,
			cycle_id: req.query.cycle_id ? Number(req.query.cycle_id) : undefined,
			thematic_area_id: req.query.thematic_area_id ? Number(req.query.thematic_area_id) : undefined,
			status: req.query.status,
			page: req.query.page,
			limit: req.query.limit,
		};
		const result = await service.listCertificates(filters, req.user);
		return successResponse(res, 200, result.items, {
			page: result.page,
			limit: result.limit,
			total: result.total,
			totalPages: result.totalPages,
		});
	} catch (error) {
		return controllerError(res, error, 'Unable to list certificates.');
	}
}

async function getCertificate(req, res) {
	try {
		const certificate = await service.getCertificate(Number(req.params.id), req.user);
		return successResponse(res, 200, certificate);
	} catch (error) {
		return controllerError(res, error, 'Unable to load certificate.');
	}
}

async function revokeCertificate(req, res) {
	try {
		const result = await service.revokeCertificate(Number(req.params.id), req.user);
		return successResponse(res, 200, result);
	} catch (error) {
		return controllerError(res, error, 'Unable to revoke certificate.');
	}
}

module.exports = {
	checkEligibility,
	issueCertificate,
	listCertificates,
	getCertificate,
	revokeCertificate,
};
