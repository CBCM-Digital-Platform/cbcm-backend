const AppError = require('../errors/app-error');
const { errorResponse } = require('./response.util');

function controllerError(res, error, fallbackMessage) {
  if (!(error instanceof AppError)) {
    console.error('Session controller error:', error && error.stack ? error.stack : error);
  }
  if (error instanceof AppError) {
    return errorResponse(res, error.statusCode, error.code, error.message, error.details || []);
  }
  return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', fallbackMessage);
}

module.exports = controllerError;