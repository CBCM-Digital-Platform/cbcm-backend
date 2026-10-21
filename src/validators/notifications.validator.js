const AppError = require('../errors/app-error');

const parseId = (value) => {
	const id = Number(value);
	if (!Number.isSafeInteger(id) || id <= 0) {
		throw new AppError('id must be a positive integer.', 400, 'VALIDATION_ERROR');
	}
	return id;
};

module.exports = { parseId };
