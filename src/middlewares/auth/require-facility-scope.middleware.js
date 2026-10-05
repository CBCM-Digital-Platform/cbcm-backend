// src/middlewares/auth/require-facility-scope.middleware.js
const AppError = require('../../errors/app-error');

function requireFacilityScope(req, res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
  }
  if (String(req.user.role || '').toLowerCase() === 'admin') {
    return next();
  }
  return next();
}

module.exports = requireFacilityScope;
