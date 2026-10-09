<<<<<<< HEAD
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
=======
// src/middlewares/auth/authenticate.middleware.js
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { User } = require('../../models');
const AppError = require('../../errors/app-error');

async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      throw new AppError('Access token is required.', 401, 'UNAUTHORIZED');
    }

    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (decoded.token_use !== 'access') {
      throw new AppError('Access token is invalid.', 401, 'INVALID_TOKEN');
    }
    const user = await User.findByPk(decoded.sub || decoded.userId || decoded.id);
    if (!user) {
      throw new AppError('Invalid session.', 401, 'INVALID_SESSION');
    }

    if (String(user.status || '').toLowerCase() !== 'active') {
      throw new AppError('Your account is inactive or suspended.', 401, 'ACCOUNT_INACTIVE');
    }
    const passwordVersion = user.password_changed_at ? new Date(user.password_changed_at).getTime() : 0;
    if (decoded.password_version !== passwordVersion) {
      throw new AppError('Session is no longer valid.', 401, 'INVALID_SESSION');
    }

    const allowedDuringPasswordChange = [
      '/api/v1/auth/change-password',
      '/api/v1/auth/logout',
      '/api/v1/auth/session',
    ];
    const requestPath = req.originalUrl.split('?')[0];
    if (user.must_change_password && !allowedDuringPasswordChange.includes(requestPath)) {
      throw new AppError('You must change your password before continuing.', 403, 'PASSWORD_CHANGE_REQUIRED');
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new AppError('Access token has expired.', 401, 'TOKEN_EXPIRED'));
    }
    if (error instanceof jwt.JsonWebTokenError) {
      return next(new AppError('Access token is invalid.', 401, 'INVALID_TOKEN'));
    }
    return next(error instanceof AppError ? error : new AppError(error.message || 'Authentication failed.', 401, 'UNAUTHORIZED'));
  }
}

module.exports = authenticate;
>>>>>>> origin/main
