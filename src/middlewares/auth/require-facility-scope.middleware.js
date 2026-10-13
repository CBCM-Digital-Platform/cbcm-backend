// src/middlewares/auth/require-facility-scope.middleware.js
const AppError = require('../../errors/app-error');
const { canAccessFacility } = require('../../constants/roles.constants');

function requireFacilityScope(req, res, next) {
  if (!req.user) {
    return next(new AppError('Authentication required.', 401, 'UNAUTHORIZED'));
  }

  const facilityId = req.params?.facilityId ?? req.params?.id ?? req.body?.facility_id ?? req.query?.facilityId;
  if (canAccessFacility(req.user, facilityId)) {
    return next();
  }

  return next(new AppError('You do not have access to this facility.', 403, 'FORBIDDEN'));
}

module.exports = requireFacilityScope;
