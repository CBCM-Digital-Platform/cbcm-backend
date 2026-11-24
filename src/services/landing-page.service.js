const { sequelize } = require('../models');
const AppError = require('../errors/app-error');
const repository = require('../repositories/landing-page.repository');
const { SYSTEM_ADMIN_ROLES, hasAnyRole } = require('../constants/roles.constants');

function toResponse(record) {
	if (!record) return null;
	const value = record.toJSON ? record.toJSON() : record;
	return {
		content: value.content,
		updated_at: value.updated_at,
	};
}

async function getLandingPage() {
	const record = await repository.getContent();
	if (!record) throw new AppError('Landing page content is not configured.', 404, 'LANDING_PAGE_NOT_FOUND');
	return toResponse(record);
}

async function updateLandingPage(content, actor) {
	if (!hasAnyRole(actor.role, SYSTEM_ADMIN_ROLES)) {
		throw new AppError('Only Super Admins can update landing page content.', 403, 'FORBIDDEN');
	}
	const record = await repository.getContent();
	if (!record) throw new AppError('Landing page content is not configured.', 404, 'LANDING_PAGE_NOT_FOUND');
	await sequelize.transaction((transaction) => repository.saveContent(
		record,
		{ content, updated_by: actor.id },
		transaction
	));
	return toResponse(record);
}

module.exports = { getLandingPage, updateLandingPage };
