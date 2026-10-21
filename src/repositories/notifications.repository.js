const models = require('../models');

const createNotifications = (notifications) => models.Notification.bulkCreate(notifications);

const listNotificationsForUser = (userId) => models.Notification.findAll({
	where: { user_id: userId },
	order: [['created_at', 'DESC'], ['id', 'DESC']],
});

const markNotificationRead = async ({ notificationId, userId }) => {
	const [updatedCount] = await models.Notification.update(
		{ is_read: true },
		{ where: { id: notificationId, user_id: userId } },
	);
	if (updatedCount === 0) return null;
	return models.Notification.findOne({ where: { id: notificationId, user_id: userId } });
};

const markAllNotificationsRead = async (userId) => {
	const [updatedCount] = await models.Notification.update(
		{ is_read: true },
		{ where: { user_id: userId, is_read: false } },
	);
	return updatedCount;
};

const countUnreadNotifications = (userId) => models.Notification.count({
	where: { user_id: userId, is_read: false },
});

const deleteNotification = async ({ notificationId, userId }) => {
	const deletedCount = await models.Notification.destroy({
		where: { id: notificationId, user_id: userId },
	});
	return deletedCount > 0;
};

module.exports = {
	createNotifications,
	listNotificationsForUser,
	markNotificationRead,
	markAllNotificationsRead,
	countUnreadNotifications,
	deleteNotification,
};
