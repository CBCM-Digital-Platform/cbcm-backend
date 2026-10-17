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

  const invalidJson = err instanceof SyntaxError && err.status === 400 && err.type === 'entity.parse.failed';
  const statusCode = err instanceof AppError ? err.statusCode : invalidJson ? 400 : 500;
  const code = err instanceof AppError
    ? err.code
    : invalidJson
      ? 'INVALID_JSON'
      : 'INTERNAL_SERVER_ERROR';
  const message = err instanceof AppError
    ? err.message
    : invalidJson
      ? 'Request body contains invalid JSON.'
      : 'An unexpected error occurred.';
  const details = err?.details || (process.env.NODE_ENV !== 'production' && err ? [err.message] : []);

  console.error('Unhandled API error:', err);

  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
