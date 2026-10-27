const AppError = require('../errors/app-error');
const repository = require('../repositories/certificates.repository');
const { canAccessFacility, canAccessUser, SYSTEM_ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../constants/roles.constants');
const storage = require('../providers/storage.provider');
const { sequelize, User, CertificateTemplate } = require('../models');

async function checkEligibility(menteeId, cycleId, thematicAreaId, actor) {
	// Validate mentee
	const mentee = await User.findByPk(menteeId);
	if (!mentee) throw new AppError('Mentee was not found.', 404, 'MENTEE_NOT_FOUND');
	if (mentee.role !== 'mentee') throw new AppError('Selected user is not a mentee.', 400, 'INVALID_ROLE');

	// Authorization for facility admin
	if (actor && actor.role === 'facility_admin' && !canAccessUser(actor, mentee)) {
		throw new AppError('You can only issue certificates for mentees within your facility.', 403, 'FORBIDDEN');
	}

	// Find eligible assessment
	const assessment = await repository.findEligibleAssessment(menteeId, cycleId, thematicAreaId);
	if (!assessment) {
		return {
			eligible: false,
			reason: 'No completed assessment with both theory and practical passes found for this mentee, cycle, and thematic area.',
		};
	}

	// Check for existing active certificate
	const existingCertificate = await repository.findActiveCertificate(menteeId, cycleId, thematicAreaId);
	if (existingCertificate) {
		return {
			eligible: false,
			reason: 'An active certificate already exists for this mentee, cycle, and thematic area.',
			existingCertificate,
		};
	}

	return {
		eligible: true,
		assessment,
	};
}

async function issueCertificate(payload, actor) {
	const { mentee_id, cycle_id, thematic_area_id, template_id } = payload;

	// Check eligibility first
	const eligibility = await checkEligibility(mentee_id, cycle_id, thematic_area_id, actor);
	if (!eligibility.eligible) {
		throw new AppError(eligibility.reason, 409, 'INELIGIBLE');
	}

	// Validate template if provided
	let template = null;
	if (template_id) {
		template = await CertificateTemplate.findByPk(template_id);
		if (!template) throw new AppError('Certificate template not found.', 404, 'TEMPLATE_NOT_FOUND');
	}

	// Get mentee name for snapshot
	const mentee = await User.findByPk(mentee_id);
	const menteeNameSnapshot = mentee.full_name || mentee.email || 'Unknown';

	// Calculate version (increment if reissuing)
	const existing = await repository.findActiveCertificate(mentee_id, cycle_id, thematic_area_id);
	const version = existing ? existing.version + 1 : 1;

	// Create certificate record
	const certificateData = {
		mentee_id,
		cycle_id,
		thematic_area_id,
		template_id: template_id || null,
		mentee_name_snapshot: menteeNameSnapshot,
		status: 'issued',
		pdf_url: null, // Will be set after PDF generation
		issued_by: actor.id,
		issued_at: new Date(),
		version,
	};

	const certificate = await sequelize.transaction(async (transaction) => {
		const created = await repository.create(certificateData);
		return created;
	});

	// Generate a minimal PDF and store it via the storage provider
	let stored = null;
	try {
		const pdfBuffer = Buffer.from(
			'%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 100 700 Td (Certificate) Tj ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 0000000058 0000000115 0000000178 0000000224 \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n284\n%%EOF\n'
		);
		stored = await storage.getStorageProvider().store({ body: pdfBuffer, mimeType: 'application/pdf' });
	} catch (error) {
		await repository.destroy(certificate.id).catch(() => {});
		throw new AppError('Unable to generate or store the certificate PDF.', 500, 'PDF_GENERATION_FAILED');
	}

	await repository.update(certificate.id, {
		pdf_url: stored.storageKey,
	});

	const issued = await repository.findById(certificate.id);
	return issued;
}

async function listCertificates(filters = {}, actor) {
	const where = {};

	// Enforce facility scope for Facility Admin
	if (actor && actor.role === 'facility_admin') {
		if (!actor.facility_id) {
			throw new AppError('Facility administrator must be assigned to a facility.', 403, 'FORBIDDEN');
		}
		// Need to filter by mentee's facility - this requires a join
		// For now, return all and filter in application
	}

	if (filters.mentee_id) where.mentee_id = filters.mentee_id;
	if (filters.cycle_id) where.cycle_id = filters.cycle_id;
	if (filters.thematic_area_id) where.thematic_area_id = filters.thematic_area_id;
	if (filters.status) where.status = filters.status;

	const { page = 1, limit = 20 } = filters;
	const { count, rows } = await repository.findMany(where, { page, limit });

	// Filter by facility for facility admins
	let filteredRows = rows;
	if (actor && actor.role === 'facility_admin' && actor.facility_id) {
		filteredRows = rows.filter((cert) => cert.mentee.facility_id === actor.facility_id);
	}

	return {
		items: filteredRows,
		total: filteredRows.length,
		page: Number(page),
		limit: Number(limit),
		totalPages: Math.max(1, Math.ceil(filteredRows.length / limit)),
	};
}

async function getCertificate(id, actor) {
	const certificate = await repository.findById(id);
	if (!certificate) throw new AppError('Certificate not found.', 404, 'CERTIFICATE_NOT_FOUND');

	// Authorization check
	if (actor && actor.role === 'facility_admin' && !canAccessFacility(actor, certificate.mentee.facility_id)) {
		throw new AppError('You do not have permission to access this certificate.', 403, 'FORBIDDEN');
	}
	if (actor && actor.role === 'mentee' && certificate.mentee_id !== actor.id) {
		throw new AppError('You can only view your own certificates.', 403, 'FORBIDDEN');
	}

	return certificate;
}

async function revokeCertificate(id, actor) {
	const certificate = await repository.findById(id);
	if (!certificate) throw new AppError('Certificate not found.', 404, 'CERTIFICATE_NOT_FOUND');

	// Authorization check
	if (!SYSTEM_ADMIN_ROLES.includes(actor.role) && !FACILITY_ADMIN_ROLES.includes(actor.role)) {
		throw new AppError('Only administrators can revoke certificates.', 403, 'FORBIDDEN');
	}
	if (actor.role === 'facility_admin' && !canAccessFacility(actor, certificate.mentee.facility_id)) {
		throw new AppError('You can only revoke certificates at your facility.', 403, 'FORBIDDEN');
	}

	await repository.update(id, { status: 'revoked' });
	return { message: 'Certificate revoked successfully.' };
}

module.exports = {
	checkEligibility,
	issueCertificate,
	listCertificates,
	getCertificate,
	revokeCertificate,
};
