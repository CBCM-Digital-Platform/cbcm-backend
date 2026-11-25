const { sequelize, PracticalChecklist, PracticalChecklistItem, ThematicArea, UploadedFile } = require('../models');
const { Op } = require('sequelize');
const AppError = require('../errors/app-error');
const { SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const repository = require('../repositories/practical-checklists.repository');

const CHECKLIST_INCLUDE = [
	{ model: ThematicArea, as: 'thematicArea', attributes: ['id', 'code', 'name'], required: false },
	{ model: UploadedFile, as: 'referenceFile', attributes: ['id', 'original_name', 'mime_type'], required: false },
];

function assertSystemAdmin(actor) {
	if (!actor || !SYSTEM_ADMIN_ROLES.includes(actor.role)) {
		throw new AppError('Only system administrators can manage practical checklists.', 403, 'FORBIDDEN');
	}
}

function serializeChecklist(checklist, { includeItems = true } = {}) {
	if (!checklist) return null;
	const value = checklist.toJSON ? checklist.toJSON() : checklist;
	const result = {
		id: value.id,
		thematic_area_id: value.thematic_area_id,
		thematic_area: value.thematicArea || null,
		procedure: value.procedure,
		title: value.title,
		description: value.description,
		version: value.version,
		status: value.status,
		reference_file_id: value.reference_file_id,
		reference_file: value.referenceFile || null,
		published_at: value.published_at,
		created_by: value.created_by,
		updated_by: value.updated_by,
		created_at: value.created_at,
		updated_at: value.updated_at,
	};
	if (includeItems) {
		result.items = (value.items || []).map((item) => ({
			id: item.id,
			item_text: item.item_text,
			sort_order: item.sort_order,
			is_required: item.is_required,
			is_critical: item.is_critical,
		}));
	}
	return result;
}

function validateItems(items) {
	if (items === undefined) return;
	if (!Array.isArray(items)) {
		throw new AppError('items must be an array.', 400, 'VALIDATION_ERROR');
	}
	for (const [index, item] of items.entries()) {
		const text = item.item_text || item.text || item.item;
		if (!text || !String(text).trim()) {
			throw new AppError(`Checklist item ${index + 1} must have non-empty text.`, 400, 'VALIDATION_ERROR');
		}
		if (item.is_required !== undefined && typeof item.is_required !== 'boolean') {
			throw new AppError(`Checklist item ${index + 1} is_required must be a boolean.`, 400, 'VALIDATION_ERROR');
		}
		if (item.is_critical !== undefined && typeof item.is_critical !== 'boolean') {
			throw new AppError(`Checklist item ${index + 1} is_critical must be a boolean.`, 400, 'VALIDATION_ERROR');
		}
	}
}

async function assertThematicArea(thematicAreaId) {
	const area = await ThematicArea.findByPk(thematicAreaId, { attributes: ['id'] });
	if (!area) throw new AppError('Thematic area not found.', 404, 'THEMATIC_AREA_NOT_FOUND');
}

async function assertReferenceFile(fileId) {
	if (fileId === undefined || fileId === null) return;
	const file = await UploadedFile.findByPk(fileId, { attributes: ['id'] });
	if (!file) throw new AppError('Reference file not found.', 404, 'FILE_NOT_FOUND');
}

async function listChecklists({ thematic_area_id, procedure, status, page = 1, limit = 20 } = {}, actor) {
	const where = {};
	if (thematic_area_id) where.thematic_area_id = thematic_area_id;
	if (procedure) {
		where[Op.or] = [
			{ procedure: { [Op.iLike]: `%${procedure}%` } },
			{ title: { [Op.iLike]: `%${procedure}%` } },
		];
	}
	// Non-admin users only see published checklists.
	if (!SYSTEM_ADMIN_ROLES.includes(actor?.role)) {
		where.status = 'published';
	} else if (status) {
		where.status = status;
	}
	const { count, rows } = await PracticalChecklist.findAndCountAll({
		where,
		include: [
			...CHECKLIST_INCLUDE,
			{ model: PracticalChecklistItem, as: 'items', attributes: ['id', 'item_text', 'sort_order', 'is_required', 'is_critical'] },
		],
		order: [['id', 'DESC']],
		limit: Math.min(Number(limit) || 20, 100),
		offset: ((Number(page) || 1) - 1) * (Math.min(Number(limit) || 20, 100)),
	});
	return {
		items: rows.map((row) => serializeChecklist(row)),
		total: count,
		page: Number(page) || 1,
		limit: Math.min(Number(limit) || 20, 100),
		totalPages: Math.max(1, Math.ceil(count / (Math.min(Number(limit) || 20, 100)))),
	};
}

async function getChecklist(id, actor) {
	const checklist = await repository.findById(id, {
		include: [
			...CHECKLIST_INCLUDE,
			{ model: PracticalChecklistItem, as: 'items', order: [['sort_order', 'ASC'], ['id', 'ASC']] },
		],
	});
	if (!checklist) throw new AppError('Practical checklist was not found.', 404, 'CHECKLIST_NOT_FOUND');
	if (!SYSTEM_ADMIN_ROLES.includes(actor?.role) && checklist.status !== 'published') {
		throw new AppError('This practical checklist is not published.', 403, 'FORBIDDEN');
	}
	return serializeChecklist(checklist);
}

async function createChecklist(payload, actor) {
	assertSystemAdmin(actor);
	const { thematic_area_id, procedure, title, description, reference_file_id, items } = payload;
	if (!thematic_area_id) throw new AppError('thematic_area_id is required.', 400, 'VALIDATION_ERROR');
	if (!procedure || !String(procedure).trim()) throw new AppError('procedure is required.', 400, 'VALIDATION_ERROR');
	if (!title || !String(title).trim()) throw new AppError('title is required.', 400, 'VALIDATION_ERROR');
	validateItems(items);
	await assertThematicArea(thematic_area_id);
	await assertReferenceFile(reference_file_id);

	const version = await repository.nextVersion(thematic_area_id, String(procedure).trim());
	const checklist = await sequelize.transaction(async (transaction) => {
		const created = await repository.create({
			thematic_area_id,
			procedure: String(procedure).trim(),
			title: String(title).trim(),
			description: description || null,
			version,
			status: 'draft',
			reference_file_id: reference_file_id || null,
			created_by: actor.id,
			updated_by: actor.id,
		}, { transaction });
		if (items && items.length > 0) {
			await repository.replaceItems(created.id, items, { transaction });
		}
		return created;
	});
	return getChecklist(checklist.id, actor);
}

async function updateChecklist(id, payload, actor) {
	assertSystemAdmin(actor);
	const checklist = await repository.findById(id, {
		include: [{ model: PracticalChecklistItem, as: 'items' }],
	});
	if (!checklist) throw new AppError('Practical checklist was not found.', 404, 'CHECKLIST_NOT_FOUND');
	if (checklist.status !== 'draft') {
		throw new AppError('Only draft checklists can be edited. Create a new version to change a published checklist.', 409, 'CHECKLIST_NOT_EDITABLE');
	}
	const { procedure, title, description, reference_file_id, items, thematic_area_id } = payload;
	validateItems(items);
	if (thematic_area_id !== undefined) await assertThematicArea(thematic_area_id);
	if (reference_file_id !== undefined) await assertReferenceFile(reference_file_id);

	const updateData = { updated_by: actor.id };
	if (procedure !== undefined) updateData.procedure = String(procedure).trim();
	if (title !== undefined) {
		if (!String(title).trim()) throw new AppError('title cannot be empty.', 400, 'VALIDATION_ERROR');
		updateData.title = String(title).trim();
	}
	if (description !== undefined) updateData.description = description;
	if (reference_file_id !== undefined) updateData.reference_file_id = reference_file_id;
	if (thematic_area_id !== undefined) updateData.thematic_area_id = thematic_area_id;

	await sequelize.transaction(async (transaction) => {
		await repository.update(id, updateData, { transaction });
		if (items !== undefined) {
			await repository.replaceItems(id, items, { transaction });
		}
	});
	return getChecklist(id, actor);
}

async function publishChecklist(id, actor) {
	assertSystemAdmin(actor);
	const checklist = await repository.findById(id, {
		include: [{ model: PracticalChecklistItem, as: 'items' }],
	});
	if (!checklist) throw new AppError('Practical checklist was not found.', 404, 'CHECKLIST_NOT_FOUND');
	if (checklist.status === 'published') return getChecklist(id, actor);
	if (checklist.status === 'archived') {
		throw new AppError('Archived checklists cannot be republished. Create a new version instead.', 409, 'CHECKLIST_ARCHIVED');
	}
	const items = checklist.items || [];
	if (items.length === 0) {
		throw new AppError('A checklist must contain at least one item before it can be published.', 422, 'EMPTY_CHECKLIST');
	}
	if (!items.some((item) => item.is_required)) {
		throw new AppError('A checklist must contain at least one required item before it can be published.', 422, 'NO_REQUIRED_ITEMS');
	}

	await sequelize.transaction(async (transaction) => {
		// Archive any previously published version of the same scope so only
		// one published version is applicable at a time.
		await PracticalChecklist.update(
			{ status: 'archived', updated_by: actor.id },
			{
				where: {
					thematic_area_id: checklist.thematic_area_id,
					procedure: checklist.procedure,
					status: 'published',
					id: { [Op.ne]: id },
				},
				transaction,
			}
		);
		await repository.update(id, {
			status: 'published',
			published_at: new Date(),
			updated_by: actor.id,
		}, { transaction });
	});
	return getChecklist(id, actor);
}

async function archiveChecklist(id, actor) {
	assertSystemAdmin(actor);
	const checklist = await repository.findById(id);
	if (!checklist) throw new AppError('Practical checklist was not found.', 404, 'CHECKLIST_NOT_FOUND');
	await repository.update(id, { status: 'archived', updated_by: actor.id });
	return getChecklist(id, actor);
}

module.exports = {
	listChecklists,
	getChecklist,
	createChecklist,
	updateChecklist,
	publishChecklist,
	archiveChecklist,
};
