const { sequelize } = require('../models');
const AppError = require('../errors/app-error');
const repository = require('../repositories/settings.repository');
const { ADMIN_ROLES, FACILITY_ADMIN_ROLES, hasAnyRole } = require('../constants/roles.constants');
const Role = require('../enums/role.enum');

const FAQ_FIELDS = ['category', 'question', 'answer', 'target_audience', 'facility_id'];
const GUIDE_FIELDS = ['title', 'content', 'attachment_file_id', 'target_audience', 'facility_id'];

function toFaqResponse(faq) {
	if (!faq) return null;
	const value = faq.toJSON ? faq.toJSON() : faq;
	return Object.fromEntries(
		['id', ...FAQ_FIELDS, 'created_by', 'updated_by', 'created_at', 'updated_at']
			.filter((field) => value[field] !== undefined)
			.map((field) => [field, value[field]])
	);
}

function toGuideResponse(guide) {
	if (!guide) return null;
	const value = guide.toJSON ? guide.toJSON() : guide;
	return Object.fromEntries(
		['id', ...GUIDE_FIELDS, 'created_by', 'updated_by', 'created_at', 'updated_at']
			.filter((field) => value[field] !== undefined)
			.map((field) => [field, value[field]])
	);
}

function buildPagination(page = 1, limit = 20) {
	return { page: Number(page), limit: Number(limit), offset: (Number(page) - 1) * Number(limit) };
}

function isVisibleToRole(targetAudience, userRole) {
	if (hasAnyRole(userRole, ADMIN_ROLES)) return true;
	if (!targetAudience) return true;
	const audienceRoles = targetAudience.split(',').map((r) => r.trim().toLowerCase());
	return audienceRoles.includes('all') || audienceRoles.includes(userRole.toLowerCase());
}

function isVisibleToActor(record, actor) {
	if (hasAnyRole(actor.role, ADMIN_ROLES)) return true;
	if (isVisibleToRole(record.target_audience, actor.role)) return true;
	if (hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		return record.facility_id !== null && record.facility_id !== undefined
			&& Number(record.facility_id) === Number(actor.facility_id);
	}
	return false;
}

function canManageFaq(faq, actor) {
	if (hasAnyRole(actor.role, ADMIN_ROLES)) {
		return true;
	}
	if (!hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		return false;
	}
	return faq.facility_id !== null && Number(faq.facility_id) === Number(actor.facility_id);
}

function canManageGuide(guide, actor) {
	if (hasAnyRole(actor.role, ADMIN_ROLES)) {
		return true;
	}
	if (!hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		return false;
	}
	return guide.facility_id !== null && Number(guide.facility_id) === Number(actor.facility_id);
}

async function listFaqs({ page = 1, limit = 20, category } = {}, actor) {
	const where = {};
	if (category) {
		where.category = category;
	}
	const pagination = buildPagination(page, limit);
	const { count, rows } = await repository.listFaqs({
		where,
		limit: pagination.limit,
		offset: pagination.offset,
	});
	const visibleRows = rows.filter((faq) => isVisibleToActor(faq, actor));
	return {
		items: visibleRows.map(toFaqResponse),
		total: visibleRows.length,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil(visibleRows.length / pagination.limit)),
	};
}

async function getFaq(id, actor) {
	const faq = await repository.findFaqById(id);
	if (!faq) throw new AppError('FAQ was not found.', 404, 'FAQ_NOT_FOUND');
	if (!isVisibleToActor(faq, actor)) {
		throw new AppError('FAQ is not visible to your role.', 403, 'NOT_VISIBLE');
	}
	return toFaqResponse(faq);
}

async function createFaq(payload, actor) {
	if (!hasAnyRole(actor.role, ADMIN_ROLES) && !hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		throw new AppError('Only admins can create FAQs.', 403, 'FORBIDDEN');
	}
	const values = Object.fromEntries(FAQ_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	if (values.question !== undefined) values.question = String(values.question).trim();
	if (values.answer !== undefined) values.answer = String(values.answer).trim();
	if (values.category !== undefined) values.category = String(values.category || '').trim();
	if (values.target_audience !== undefined) values.target_audience = String(values.target_audience || '').trim();
	if (hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		values.facility_id = actor.facility_id;
	}
	values.created_by = actor.id;
	const faq = await sequelize.transaction((transaction) => repository.createFaq(values, transaction));
	return toFaqResponse(faq);
}

async function updateFaq(id, payload, actor) {
	if (!hasAnyRole(actor.role, ADMIN_ROLES) && !hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		throw new AppError('Only admins can update FAQs.', 403, 'FORBIDDEN');
	}
	const faq = await repository.findFaqById(id);
	if (!faq) throw new AppError('FAQ was not found.', 404, 'FAQ_NOT_FOUND');
	if (!canManageFaq(faq, actor)) {
		throw new AppError('You do not have permission to update this FAQ.', 403, 'FORBIDDEN');
	}
	const values = Object.fromEntries(FAQ_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	if (values.question !== undefined) values.question = String(values.question).trim();
	if (values.answer !== undefined) values.answer = String(values.answer).trim();
	if (values.category !== undefined) values.category = String(values.category || '').trim();
	if (values.target_audience !== undefined) values.target_audience = String(values.target_audience || '').trim();
	if (hasAnyRole(actor.role, FACILITY_ADMIN_ROLES) && values.facility_id !== undefined && values.facility_id !== null) {
		delete values.facility_id;
	}
	values.updated_by = actor.id;
	await sequelize.transaction((transaction) => repository.updateFaq(faq, values, transaction));
	return toFaqResponse(faq);
}

async function deleteFaq(id, actor) {
	if (!hasAnyRole(actor.role, ADMIN_ROLES) && !hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		throw new AppError('Only admins can delete FAQs.', 403, 'FORBIDDEN');
	}
	const faq = await repository.findFaqById(id);
	if (!faq) throw new AppError('FAQ was not found.', 404, 'FAQ_NOT_FOUND');
	if (!canManageFaq(faq, actor)) {
		throw new AppError('You do not have permission to delete this FAQ.', 403, 'FORBIDDEN');
	}
	await sequelize.transaction((transaction) => repository.deleteFaq(faq, transaction));
}

async function listGuides({ page = 1, limit = 20 } = {}, actor) {
	const where = {};
	const pagination = buildPagination(page, limit);
	const { count, rows } = await repository.listGuides({
		where,
		limit: pagination.limit,
		offset: pagination.offset,
	});
	const visibleRows = rows.filter((guide) => isVisibleToActor(guide, actor));
	return {
		items: visibleRows.map(toGuideResponse),
		total: visibleRows.length,
		page: pagination.page,
		limit: pagination.limit,
		totalPages: Math.max(1, Math.ceil(visibleRows.length / pagination.limit)),
	};
}

async function getGuide(id, actor) {
	const guide = await repository.findGuideById(id);
	if (!guide) throw new AppError('Guide was not found.', 404, 'GUIDE_NOT_FOUND');
	if (!isVisibleToActor(guide, actor)) {
		throw new AppError('Guide is not visible to your role.', 403, 'NOT_VISIBLE');
	}
	return toGuideResponse(guide);
}

async function createGuide(payload, actor) {
	if (!hasAnyRole(actor.role, ADMIN_ROLES) && !hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		throw new AppError('Only admins can create guides.', 403, 'FORBIDDEN');
	}
	const values = Object.fromEntries(GUIDE_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	if (values.title !== undefined) values.title = String(values.title).trim();
	if (values.content !== undefined) values.content = String(values.content).trim();
	if (values.target_audience !== undefined) values.target_audience = String(values.target_audience || '').trim();
	if (values.attachment_file_id !== undefined && values.attachment_file_id !== null) {
		const file = await repository.getUploadedFile(values.attachment_file_id);
		if (!file) throw new AppError('Attachment file not found.', 404, 'NOT_FOUND');
	}
	if (hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		values.facility_id = actor.facility_id;
	}
	values.created_by = actor.id;
	const guide = await sequelize.transaction((transaction) => repository.createGuide(values, transaction));
	return toGuideResponse(guide);
}

async function updateGuide(id, payload, actor) {
	if (!hasAnyRole(actor.role, ADMIN_ROLES) && !hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		throw new AppError('Only admins can update guides.', 403, 'FORBIDDEN');
	}
	const guide = await repository.findGuideById(id);
	if (!guide) throw new AppError('Guide was not found.', 404, 'GUIDE_NOT_FOUND');
	if (!canManageGuide(guide, actor)) {
		throw new AppError('You do not have permission to update this guide.', 403, 'FORBIDDEN');
	}
	const values = Object.fromEntries(GUIDE_FIELDS.filter((field) => payload[field] !== undefined).map((field) => [field, payload[field]]));
	if (values.title !== undefined) values.title = String(values.title).trim();
	if (values.content !== undefined) values.content = String(values.content).trim();
	if (values.target_audience !== undefined) values.target_audience = String(values.target_audience || '').trim();
	if (hasAnyRole(actor.role, FACILITY_ADMIN_ROLES) && values.facility_id !== undefined && values.facility_id !== null) {
		delete values.facility_id;
	}
	if (values.attachment_file_id !== undefined && values.attachment_file_id !== null) {
		const file = await repository.getUploadedFile(values.attachment_file_id);
		if (!file) throw new AppError('Attachment file not found.', 404, 'NOT_FOUND');
	}
	values.updated_by = actor.id;
	await sequelize.transaction((transaction) => repository.updateGuide(guide, values, transaction));
	return toGuideResponse(guide);
}

async function deleteGuide(id, actor) {
	if (!hasAnyRole(actor.role, ADMIN_ROLES) && !hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
		throw new AppError('Only admins can delete guides.', 403, 'FORBIDDEN');
	}
	const guide = await repository.findGuideById(id);
	if (!guide) throw new AppError('Guide was not found.', 404, 'GUIDE_NOT_FOUND');
	if (!canManageGuide(guide, actor)) {
		throw new AppError('You do not have permission to delete this guide.', 403, 'FORBIDDEN');
	}
	await sequelize.transaction((transaction) => repository.deleteGuide(guide, transaction));
}

module.exports = {
	listFaqs,
	getFaq,
	createFaq,
	updateFaq,
	deleteFaq,
	listGuides,
	getGuide,
	createGuide,
	updateGuide,
	deleteGuide,
};
