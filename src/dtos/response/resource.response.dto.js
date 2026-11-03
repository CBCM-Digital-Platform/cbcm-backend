// src/dtos/response/resource.response.dto.js

function toResource(record) {
	if (!record) return null;
	const value = record?.get ? record.get({ plain: true }) : (record || {});

	const thematicAreaId = value.thematic_area_id ?? value.thematicAreaId ?? null;
	const moduleId = value.module_id ?? value.moduleId ?? null;
	const fileId = value.file_id ?? value.fileId ?? null;
	const createdBy = value.created_by ?? value.createdBy ?? null;
	const updatedBy = value.updated_by ?? value.updatedBy ?? null;
	const createdAt = value.created_at ?? value.createdAt ?? null;
	const updatedAt = value.updated_at ?? value.updatedAt ?? null;

	const result = {
		id: value.id,
		title: value.title,
		type: value.type,
		thematicAreaId,
		thematic_area_id: thematicAreaId,
		moduleId,
		module_id: moduleId,
		fileId,
		file_id: fileId,
		createdBy,
		created_by: createdBy,
		updatedBy,
		updated_by: updatedBy,
		createdAt,
		created_at: createdAt,
		updatedAt,
		updated_at: updatedAt,
	};

	if (value.module) {
		const mod = value.module?.get ? value.module.get({ plain: true }) : value.module;
		result.module = {
			id: mod.id,
			title: mod.title,
			thematicAreaId: mod.thematic_area_id ?? mod.thematicAreaId ?? null,
			status: mod.status || 'draft',
			isPublished: Boolean(mod.is_published ?? mod.isPublished),
			isAuthorized: Boolean(mod.is_authorized ?? mod.isAuthorized),
		};
	} else {
		result.module = null;
	}

	if (value.thematicArea || value.thematic_area) {
		const area = value.thematicArea || value.thematic_area;
		const areaPlain = area?.get ? area.get({ plain: true }) : area;
		result.thematicArea = {
			id: areaPlain.id,
			code: areaPlain.code,
			name: areaPlain.name,
		};
		result.thematic_area = result.thematicArea;
	} else {
		result.thematicArea = null;
		result.thematic_area = null;
	}

	if (value.file) {
		const file = value.file?.get ? value.file.get({ plain: true }) : value.file;
		result.file = {
			id: file.id,
			mimeType: file.mime_type ?? file.mimeType ?? null,
			sizeBytes: Number(file.size_bytes ?? file.sizeBytes ?? 0),
			createdAt: file.created_at ?? file.createdAt ?? null,
		};
	} else {
		result.file = null;
	}

	return result;
}

module.exports = {
	toResource,
	fromModel: toResource,
};
