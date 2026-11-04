const repository = require('../repositories/notifications.repository');
const AppError = require('../errors/app-error');
const { Op } = require('sequelize');
const { User } = require('../models');
const Role = require('../enums/role.enum');

const EVENT_DEFINITIONS = Object.freeze({
	'user.account_created': ['user_account_created', 'User account created', 'A user account has been created.', ['admin', 'facility_admin']],
	'user.status_changed': ['user_status_changed', 'User account status changed', 'A user account status has changed.', ['admin', 'facility_admin']],
	'assignment.created': ['assignment_created', 'New mentorship assignment', 'A new mentorship assignment has been created.', ['admin', 'facility_admin']],
	'assignment.updated': ['assignment_updated', 'Mentorship assignment updated', 'A mentorship assignment has been updated.', ['admin', 'facility_admin']],
	'assignment.status_changed': ['assignment_status_changed', 'Mentorship assignment status changed', 'The status of a mentorship assignment has changed.', ['admin', 'facility_admin']],
	'session.scheduled': ['session_scheduled', 'Clinical session scheduled', 'A clinical session has been scheduled.', ['admin', 'facility_admin']],
	'session.status_changed': ['session_status_changed', 'Clinical session updated', 'A clinical session requires your attention.', ['admin', 'facility_admin']],
	'logbook.submitted': ['logbook_submitted', 'Logbook submitted', 'A mentee has submitted a logbook entry for review.', ['admin', 'facility_admin']],
	'logbook.approved': ['logbook_approved', 'Logbook approved', 'Your logbook entry was approved.', ['admin', 'facility_admin']],
	'logbook.revision_requested': ['logbook_revision_requested', 'Logbook revision requested', 'Your logbook entry needs revision.', ['admin', 'facility_admin']],
	'assessment.finalized': ['assessment_finalized', 'Assessment finalized', 'An assessment result has been finalized.', ['admin', 'facility_admin']],
	'assessment.reviewed': ['assessment_reviewed', 'Assessment reviewed', 'An assessment has been reviewed and requires follow-up.', ['admin', 'facility_admin']],
	'certificate.issued': ['certificate_issued', 'Certificate issued', 'A certificate has been issued.', ['admin', 'facility_admin']],
	'resource.assigned': ['resource_assigned', 'Learning resource assigned', 'A learning resource has been assigned to a mentee.', ['admin', 'facility_admin']],
	'learning.module_access_granted': ['learning_module_access_granted', 'Learning module access granted', 'You have been granted access to a learning module.', ['admin', 'facility_admin']],
	'cycle.status_changed': ['cycle_status_changed', 'Mentorship cycle status changed', 'A mentorship cycle status has changed.', ['admin', 'facility_admin']],
});

const uniqueIds = (ids) => [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];

async function resolveEventRecipients({ roles = [], facilityIds = [], userIds = [] }) {
	const ids = uniqueIds(userIds);
	const normalizedFacilityIds = uniqueIds(facilityIds);
	const requestedRoles = roles.filter((role) => [Role.ADMIN, Role.FACILITY_ADMIN, Role.MENTOR, Role.MENTEE].includes(role));
	// Facility-scoped roles must never be resolved globally. Callers must provide
	// a facility scope; direct participant IDs remain valid without one.
	const roleFilters = normalizedFacilityIds.length
		? requestedRoles
		: requestedRoles.filter((role) => role === Role.ADMIN);
	if (roleFilters.length) {
		const where = { role: { [Op.in]: roleFilters } };
		if (normalizedFacilityIds.length) {
			where[Op.or] = [
				...(roleFilters.includes(Role.ADMIN) ? [{ role: Role.ADMIN }] : []),
				{ role: { [Op.ne]: Role.ADMIN }, facility_id: { [Op.in]: normalizedFacilityIds } },
			];
		}
		const users = await User.findAll({ attributes: ['id'], where });
		ids.push(...users.map((user) => user.id));
	}
	return uniqueIds(ids);
}

async function publishEvent({ eventType, eventKey, referenceType = null, referenceId = null, userIds = [], facilityIds = [], roles, transaction = null }) {
	if (!EVENT_DEFINITIONS[eventType]) throw new AppError(`Unsupported notification event: ${eventType}`, 400, 'VALIDATION_ERROR');
	if (!eventKey || typeof eventKey !== 'string') throw new AppError('Notification event key is required.', 400, 'VALIDATION_ERROR');
	const [, title, body, defaultRoles] = EVENT_DEFINITIONS[eventType];
	const recipientIds = await resolveEventRecipients({
		roles: roles || defaultRoles,
		facilityIds,
		userIds,
	});
	if (!recipientIds.length) return [];
	return createNotifications({
		userIds: recipientIds,
		type: EVENT_DEFINITIONS[eventType][0],
		title,
		body,
		referenceType,
		referenceId,
		eventKey,
		transaction,
	});
}

async function publishEventSafely(input) {
	try {
		return await publishEvent(input);
	} catch (error) {
		// Notification delivery must not turn a completed business operation into a failure.
		console.error(`Notification event ${input.eventType} failed:`, error.message);
		return [];
	}
}

const createNotifications = async ({
	userIds,
	type,
	title,
	body = null,
	referenceType = null,
	referenceId = null,
	eventKey = null,
	transaction = null,
}) => {
	if (!Array.isArray(userIds)) {
		throw new AppError('userIds must be an array.', 400, 'VALIDATION_ERROR');
	}
	if (typeof type !== 'string' || !type.trim()) {
		throw new AppError('Notification type is required.', 400, 'VALIDATION_ERROR');
	}
	if (typeof title !== 'string' || !title.trim()) {
		throw new AppError('Notification title is required.', 400, 'VALIDATION_ERROR');
	}
	if (body !== null && typeof body !== 'string') {
		throw new AppError('Notification body must be a string or null.', 400, 'VALIDATION_ERROR');
	}

	const normalizedUserIds = [...new Set(userIds.map(Number))];
	if (normalizedUserIds.some((userId) => !Number.isInteger(userId) || userId <= 0)) {
		throw new AppError('Every notification recipient must have a valid user ID.', 400, 'VALIDATION_ERROR');
	}
	if (normalizedUserIds.length === 0) return [];

	const createdAt = new Date();
	return repository.createNotifications(normalizedUserIds.map((userId) => ({
		user_id: userId,
		type: type.trim(),
		title: title.trim(),
		body,
		is_read: false,
		reference_type: referenceType,
		reference_id: referenceId,
		event_key: eventKey,
		created_at: createdAt,
	})), transaction ? { transaction } : {});
};

const createNotification = async ({ userId, ...notification }) => {
	const [createdNotification] = await createNotifications({
		...notification,
		userIds: [userId],
	});
	return createdNotification;
};

const listNotifications = (userId) => repository.listNotificationsForUser(userId);

const markRead = async ({ notificationId, userId }) => {
	const notification = await repository.markNotificationRead({ notificationId, userId });
	if (!notification) throw new AppError('Notification not found.', 404, 'NOT_FOUND');
	return notification;
};

const markAllRead = async (userId) => ({
	updatedCount: await repository.markAllNotificationsRead(userId),
});

const getUnreadCount = (userId) => repository.countUnreadNotifications(userId);

const deleteNotification = async ({ notificationId, userId }) => {
	const deleted = await repository.deleteNotification({ notificationId, userId });
	if (!deleted) throw new AppError('Notification not found.', 404, 'NOT_FOUND');
};

module.exports = {
	createNotification,
	createNotifications,
	publishEvent,
	publishEventSafely,
	listNotifications,
	markRead,
	markAllRead,
	getUnreadCount,
	deleteNotification,
};
