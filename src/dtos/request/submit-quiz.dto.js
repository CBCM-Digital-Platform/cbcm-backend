const AppError = require('../errors/app-error');

const parseSubmitQuiz = (body = {}) => {
	const answers = Array.isArray(body.answers) ? body.answers : [];
	if (answers.length === 0) {
		throw new AppError('answers must be a non-empty array.', 400, 'VALIDATION_ERROR');
	}

	return {
		answers: answers.map((answer, index) => {
			const optionIds = Array.isArray(answer.selectedOptionIds)
				? answer.selectedOptionIds
				: answer.selectedOptionId != null
					? [answer.selectedOptionId]
					: [];
			return {
				questionId: Number(answer.questionId ?? index + 1),
				selectedOptionIds: optionIds.map((id) => Number(id)),
			};
		})
	};
};

module.exports = { parseSubmitQuiz };
