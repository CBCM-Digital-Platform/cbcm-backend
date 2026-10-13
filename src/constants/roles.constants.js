const Role = require('../enums/role.enum');

const SYSTEM_ADMIN_ROLES = Object.freeze([Role.ADMIN]);
const FACILITY_ADMIN_ROLES = Object.freeze([Role.FACILITY_ADMIN]);
const FACILITY_MANAGEMENT_ROLES = Object.freeze([Role.ADMIN, Role.FACILITY_ADMIN]);
const RESTRICTED_ASSIGNABLE_ROLES = Object.freeze([Role.ADMIN, Role.FACILITY_ADMIN]);

function hasAnyRole(userRole, allowedRoles = []) {
  const normalizedUserRole = String(userRole || '').trim().toLowerCase();
  return allowedRoles.some((allowedRole) => String(allowedRole || '').trim().toLowerCase() === normalizedUserRole);
}

function canAssignRole(actorRole, targetRole) {
  if (hasAnyRole(actorRole, SYSTEM_ADMIN_ROLES)) {
    return true;
  }
  if (!hasAnyRole(actorRole, FACILITY_ADMIN_ROLES)) {
    return false;
  }
  return !hasAnyRole(targetRole, RESTRICTED_ASSIGNABLE_ROLES);
}

function canAccessFacility(actor, facilityId) {
  if (!actor) {
    return false;
  }
  if (hasAnyRole(actor.role, SYSTEM_ADMIN_ROLES)) {
    return true;
  }
  if (!facilityId || !actor.facility_id) {
    return false;
  }
  return hasAnyRole(actor.role, FACILITY_ADMIN_ROLES) && Number(actor.facility_id) === Number(facilityId);
}

function canAccessUser(actor, user) {
  if (!actor || !user) {
    return false;
  }
  if (hasAnyRole(actor.role, SYSTEM_ADMIN_ROLES)) {
    return true;
  }
  if (!hasAnyRole(actor.role, FACILITY_ADMIN_ROLES)) {
    return false;
  }
  if (user.facility_id == null) {
    return false;
  }
  return Number(actor.facility_id) === Number(user.facility_id);
}

module.exports = Object.freeze({
  USER_ROLES: Object.values(Role),
  ADMIN_ROLES: SYSTEM_ADMIN_ROLES,
  FACILITY_ADMIN_ROLES,
  FACILITY_MANAGEMENT_ROLES,
  SYSTEM_ADMIN_ROLES,
  RESTRICTED_ASSIGNABLE_ROLES,
  hasAnyRole,
  canAssignRole,
  canAccessFacility,
  canAccessUser,
});
