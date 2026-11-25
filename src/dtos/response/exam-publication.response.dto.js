function toExamPublicationResponse(exam) {
	const value = exam?.toJSON ? exam.toJSON() : exam || {};
	return {
		id: value.id,
		title: value.title,
		stage: value.stage,
		cycleId: value.cycle_id,
		thematicAreaId: value.thematic_area_id,
		version: value.version,
		isPublished: Boolean(value.is_published),
		isAuthorized: Boolean(value.is_authorized),
	};
}

module.exports = { toExamPublicationResponse };
