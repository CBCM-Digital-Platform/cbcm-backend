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
	};
};

module.exports = { toModule };
