const express = require('express');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const controller = require('../controllers/notifications.controller');
const validator = require('../validators/notifications.validator');

const router = express.Router();
const validateId = (req, res, next) => {
	try {
		req.params.id = validator.parseId(req.params.id);
		return next();
	} catch (error) {
		return next(error);
	}
};

router.use(authenticate);
router.get('/unread-count', controller.getUnreadCount);
router.patch('/read-all', controller.markAllRead);
router.get('/', controller.listNotifications);
router.patch('/:id/read', validateId, controller.markRead);
router.delete('/:id', validateId, controller.deleteNotification);

module.exports = router;
