const express = require('express');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const controller = require('../controllers/messaging.controller');
const validator = require('../validators/messaging.validator');

const router = express.Router();
const validate = (parser) => (req, res, next) => {
	try {
		req.messagingInput = parser(req.body);
		return next();
	} catch (error) {
		return next(error);
	}
};
const validateId = (req, res, next) => {
	try {
		req.params.id = validator.parseId(req.params.id, 'id');
		return next();
	} catch (error) {
		return next(error);
	}
};

router.use(authenticate);
router.get('/conversations', controller.listConversations);
router.get('/conversations/:id', validateId, controller.getConversation);
router.post('/conversations', validate(validator.parseCreateConversation), controller.createConversation);
router.post('/conversations/:id/messages', validateId, validate(validator.parseSendMessage), controller.sendMessage);
router.patch('/conversations/:id/read', validateId, controller.markRead);

module.exports = router;
