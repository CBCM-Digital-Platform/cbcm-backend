const service = require('../services/notifications.service');
const notificationMapper = require('../mappers/notification.mapper');

const asyncHandler = (handler) => (req, res, next) => {
	Promise.resolve(handler(req, res, next)).catch(next);
};

module.exports = {
	listNotifications: asyncHandler(async (req, res) => {
		const notifications = await service.listNotifications(req.user.id);
		return res.json({
			success: true,
			data: notifications.map(notificationMapper.toNotification),
		});
	}),
	markRead: asyncHandler(async (req, res) => {
		const notification = await service.markRead({
			notificationId: req.params.id,
			userId: req.user.id,
		});
		return res.json({ success: true, data: notificationMapper.toNotification(notification) });
	}),
	markAllRead: asyncHandler(async (req, res) => {
		const result = await service.markAllRead(req.user.id);
		return res.json({ success: true, data: result });
	}),
	getUnreadCount: asyncHandler(async (req, res) => {
		const unreadCount = await service.getUnreadCount(req.user.id);
		return res.json({ success: true, data: { unreadCount } });
	}),
	deleteNotification: asyncHandler(async (req, res) => {
		await service.deleteNotification({
			notificationId: req.params.id,
			userId: req.user.id,
		});
		return res.json({ success: true, data: { deleted: true } });
	}),
};
