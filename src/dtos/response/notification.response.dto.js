const toNotification = (notification) => {
	const value = notification.get ? notification.get({ plain: true }) : notification;
	return {
		id: value.id,
		type: value.type,
		title: value.title,
		body: value.body,
		isRead: value.is_read,
		referenceType: value.reference_type,
		referenceId: value.reference_id,
		createdAt: value.created_at,
	};
};

module.exports = { toNotification };
