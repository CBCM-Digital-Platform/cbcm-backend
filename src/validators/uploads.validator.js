const AppError = require('../errors/app-error');

const invalid = (message) => new AppError(message, 400, 'VALIDATION_ERROR');

const parseId = (value, field = 'id') => {
	const id = Number(value);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw invalid(`${field} must be a positive integer.`);
	}
	return id;
};

const parseContext = (value) => {
	if (value === undefined || value === null || value === '') return 'resource';
	const context = String(value).trim();
	if (!context || context.length > 50) {
		throw invalid('context must be between 1 and 50 characters.');
	}
	if (!/^[a-z0-9_-]+$/i.test(context)) {
		throw invalid('context may contain only letters, numbers, underscores, and hyphens.');
	}
	return context;
};

module.exports = {
	parseId,
	parseContext,
};
