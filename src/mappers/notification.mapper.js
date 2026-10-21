const notificationDto = require('../dtos/response/notification.response.dto');

const toNotification = (notification) => notificationDto.toNotification(notification);

module.exports = { toNotification };
