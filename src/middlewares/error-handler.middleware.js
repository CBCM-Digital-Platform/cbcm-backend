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
};
