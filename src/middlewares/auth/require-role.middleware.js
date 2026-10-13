// src/middlewares/auth/require-role.middleware.js
const AppError = require('../../errors/app-error');
const { hasAnyRole } = require('../../constants/roles.constants');

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
    }

    const acceptedRoles = Array.isArray(roles) ? roles : [roles];
    const userRole = String(req.user.role || '').toLowerCase();
    if (!hasAnyRole(userRole, acceptedRoles)) {
      return next(new AppError('You do not have permission to perform this action.', 403, 'FORBIDDEN'));
    }

    return next();
  };
}

module.exports = requireRole;
