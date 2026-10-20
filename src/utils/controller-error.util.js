const AppError = require('../errors/app-error');
const { errorResponse } = require('./response.util');

function controllerError(res, error, fallbackMessage) {
  if (error instanceof AppError) {
    return errorResponse(res, error.statusCode, error.code, error.message, error.details || []);
  }
  console.error('Controller Error:', error);
  console.error('Error Stack:', error.stack);
  console.error('Error Name:', error.name);
  console.error('Error Message:', error.message);
  return errorResponse(res, 500, 'INTERNAL_SERVER_ERROR', fallbackMessage);
}

module.exports = controllerError;