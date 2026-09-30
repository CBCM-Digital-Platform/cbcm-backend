const jwt = require('jsonwebtoken');
const AppError = require('../../errors/app-error');

module.exports = (req, res, next) => {
	const authorization = req.get('authorization');
	const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
	if (!token) {
		return next(new AppError('Authentication is required.', 401, 'UNAUTHORIZED'));
	}
	if (!process.env.JWT_SECRET) {
		return next(new AppError('Authentication is not configured.', 500, 'AUTH_NOT_CONFIGURED'));
	}

	try {
		const claims = jwt.verify(token, process.env.JWT_SECRET);
		const id = Number(claims.sub ?? claims.userId ?? claims.id);
		if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid token user id.');
		req.user = { id };
		return next();
	} catch (error) {
		return next(new AppError('Invalid or expired authentication token.', 401, 'UNAUTHORIZED'));
	}
};
