function toExamSummary(exam) {
	return {
		id: exam.id,
		title: exam.title,
		description: exam.description ?? null,
		stage: exam.stage,
		cycleId: exam.cycle_id,
		thematicAreaId: exam.thematic_area_id,
		cycle: exam.cycle ? { id: exam.cycle.id, name: exam.cycle.name, status: exam.cycle.status } : null,
		thematicArea: exam.thematicArea ? { id: exam.thematicArea.id, code: exam.thematicArea.code, name: exam.thematicArea.name } : null,
		version: exam.version,
		totalQuestions: exam.total_questions,
		totalMarks: exam.total_marks,
		isPublished: Boolean(exam.is_published),
		isAuthorized: Boolean(exam.is_authorized),
	};
}

function toExamDetails(exam) {
	return {
		...toExamSummary(exam),
		questions: (exam.questions || []).map((question) => ({
			id: question.id,
			text: question.question_text,
			type: question.question_type,
			marks: question.marks,
			order: question.order_number,
			options: (question.options || []).map((option) => ({ id: option.id, label: option.option_label, text: option.option_text })),
		})),
	};
}

module.exports = { toExamSummary, toExamDetails };
