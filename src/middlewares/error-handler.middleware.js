<<<<<<< HEAD
module.exports = (error, req, res, next) => {
	if (res.headersSent) return next(error);

	const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
	return res.status(statusCode).json({
		success: false,
		error: {
			code: error.code || 'INTERNAL_ERROR',
			message: statusCode === 500 ? 'An unexpected error occurred.' : error.message,
		},
	});
=======
// src/middlewares/error-handler.middleware.js
const AppError = require('../errors/app-error');

function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested route was not found.',
      details: [],
    },
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const code = err instanceof AppError ? err.code : 'INTERNAL_SERVER_ERROR';
  const message = err instanceof AppError ? err.message : 'An unexpected error occurred.';

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details: err.details || [],
    },
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
>>>>>>> origin/main
};
