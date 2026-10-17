const repository = require('../repositories/notifications.repository');
const AppError = require('../errors/app-error');

const createNotifications = async ({
	userIds,
	type,
	title,
	body = null,
	referenceType = null,
	referenceId = null,
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
		created_at: createdAt,
	})));
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
	listNotifications,
	markRead,
	markAllRead,
	getUnreadCount,
	deleteNotification,
};
