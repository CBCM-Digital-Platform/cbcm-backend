const Role = require('../enums/role.enum');

module.exports = Object.freeze({
	USER_ROLES: Object.values(Role),
	ADMIN_ROLES: Object.freeze([Role.ADMIN]),
});
