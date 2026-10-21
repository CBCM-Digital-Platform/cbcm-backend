const toModule = (moduleRecord) => {
	const value = moduleRecord?.get ? moduleRecord.get({ plain: true }) : moduleRecord || {};
	return {
		id: value.id,
		title: value.title,
		description: value.description || null,
		thematicAreaId: value.thematic_area_id ?? value.thematicAreaId ?? null,
		protocolSummary: value.protocol_summary || null,
		status: value.status || 'draft',
		orderNumber: value.order_number ?? 0,
		isPublished: Boolean(value.is_published),
		isAuthorized: Boolean(value.is_authorized),
		estimatedDurationMinutes: value.estimated_duration_minutes ?? 0,
		createdBy: value.created_by ?? null,
		updatedBy: value.updated_by ?? null,
		createdAt: value.created_at || null,
		updatedAt: value.updated_at || null,
		contents: Array.isArray(value.contents) ? value.contents.map((content) => ({
			id: content.id,
			title: content.title,
			type: content.type,
			orderNumber: content.order_number ?? 0,
			isRequired: Boolean(content.is_required),
			isPublished: Boolean(content.is_published),
			isAuthorized: Boolean(content.is_authorized),
		}) ) : [],
	};
};

module.exports = { toModule };
