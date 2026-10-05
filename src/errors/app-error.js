<<<<<<< HEAD
class AppError extends Error {
	constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
		super(message);
		this.name = 'AppError';
		this.statusCode = statusCode;
		this.code = code;
		Error.captureStackTrace?.(this, AppError);
	}
=======
// src/errors/app-error.js
class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_SERVER_ERROR', details = []) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
>>>>>>> origin/main
}

module.exports = AppError;
