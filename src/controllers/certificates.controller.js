const { successResponse, controllerError } = require('../utils/response');
const service = require('../services/certificates.service');

async function checkEligibility(req, res, next) {
	try {
		const { mentee_id, cycle_id, thematic_area_id } = req.params;
		const result = await service.checkEligibility(
			Number(mentee_id),
			Number(cycle_id),
			Number(thematic_area_id),
			req.user
		);
		successResponse(res, result, 200);
	} catch (error) {
		controllerError(error, req, res, next);
	}
}

async function issueCertificate(req, res, next) {
	try {
		const certificate = await service.issueCertificate(req.body, req.user);
		successResponse(res, certificate, 201);
	} catch (error) {
		controllerError(error, req, res, next);
	}
}

async function listCertificates(req, res, next) {
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
		successResponse(res, result, 200);
	} catch (error) {
		controllerError(error, req, res, next);
	}
}

async function getCertificate(req, res, next) {
	try {
		const certificate = await service.getCertificate(Number(req.params.id), req.user);
		successResponse(res, certificate, 200);
	} catch (error) {
		controllerError(error, req, res, next);
	}
}

async function revokeCertificate(req, res, next) {
	try {
		const result = await service.revokeCertificate(Number(req.params.id), req.user);
		successResponse(res, result, 200);
	} catch (error) {
		controllerError(error, req, res, next);
	}
}

module.exports = {
	checkEligibility,
	issueCertificate,
	listCertificates,
	getCertificate,
	revokeCertificate,
};
