function toExamImportResponse(exam, { thematicArea, cycle, rowCount }) {
	const value = exam?.toJSON ? exam.toJSON() : exam || {};
	return {
		id: value.id,
		title: value.title,
		description: value.description ?? null,
		stage: value.stage,
		thematicArea: thematicArea ? { id: thematicArea.id, code: thematicArea.code, name: thematicArea.name } : null,
		cycle: cycle ? { id: cycle.id, name: cycle.name, status: cycle.status } : null,
		version: value.version,
		totalQuestions: value.total_questions,
		totalMarks: value.total_marks,
		isPublished: value.is_published,
		isAuthorized: value.is_authorized,
		createdAt: value.created_at ?? null,
		importSummary: { questionsCreated: rowCount, optionsPerQuestion: 4 },
	};
}

module.exports = { toExamImportResponse };
