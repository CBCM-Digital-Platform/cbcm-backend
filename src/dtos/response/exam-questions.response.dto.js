function toExamQuestionsResponse(exam) {
	return {
		id: exam.id,
		title: exam.title,
		description: exam.description ?? null,
		stage: exam.stage,
		cycleId: exam.cycle_id,
		thematicAreaId: exam.thematic_area_id,
		version: exam.version,
		totalQuestions: exam.total_questions,
		totalMarks: exam.total_marks,
		questions: (exam.questions || []).map((question) => ({
			id: question.id,
			text: question.question_text,
			order: question.order_number,
			marks: question.marks,
			options: (question.options || []).map((option) => ({
				id: option.id,
				label: option.option_label,
				text: option.option_text,
			})),
		})),
	};
}

module.exports = { toExamQuestionsResponse };
