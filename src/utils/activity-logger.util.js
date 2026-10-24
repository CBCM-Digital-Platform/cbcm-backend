// src/utils/activity-logger.util.js
const { ActivityLog } = require('../models');

async function logActivity({ actorId = null, action, entityType = 'user', entityId = null, facilityId = null, outcome = 'success', metadata = {}, ipAddress = null, userAgent = null }) {
	try {
		const sanitizedMetadata = metadata;
		await ActivityLog.create({
			actor_id: actorId,
			facility_id: facilityId,
			action,
			entity_type: entityType,
			entity_id: entityId,
			details: JSON.stringify({ outcome, ...sanitizedMetadata }),
			ip_address: ipAddress,
			user_agent: userAgent,
		});
	} catch (error) {
		console.error(`Failed to log activity event: ${action}`, error.message);
	}
}

module.exports = { logActivity };
