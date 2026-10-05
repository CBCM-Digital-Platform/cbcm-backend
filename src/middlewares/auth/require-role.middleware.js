// src/middlewares/auth/require-role.middleware.js
const AppError = require('../../errors/app-error');

function requireRole(roles) {
  return (req, res, next) => {
    const acceptedRoles = Array.isArray(roles) ? roles : [roles];
    const userRole = String(req.user?.role || '').toLowerCase();
    if (!req.user || !acceptedRoles.map((role) => String(role).toLowerCase()).includes(userRole)) {
      return next(new AppError('You do not have permission to perform this action.', 403, 'FORBIDDEN'));
    }
    return next();
  };
}

module.exports = requireRole;
