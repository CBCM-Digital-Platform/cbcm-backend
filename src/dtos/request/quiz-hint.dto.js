const AppError = require('../errors/app-error');

const parseQuizHint = (body = {}) => {
	if (body.questionId == null) {
		throw new AppError('questionId is required.', 400, 'VALIDATION_ERROR');
	}
	return {
		questionId: Number(body.questionId),
		context: typeof body.context === 'string' ? body.context.trim() : '',
	};
};

module.exports = { parseQuizHint };
