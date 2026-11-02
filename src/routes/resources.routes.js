const express = require('express');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const controller = require('../controllers/resources.controller');
const { parseId } = require('../validators/resources.validator');

const router = express.Router();

const validateId = (req, res, next) => {
	try {
		req.params.id = String(parseId(req.params.id, 'id'));
		return next();
	} catch (error) {
		return next(error);
	}
};

router.use(authenticate);

router.post('/', requireRole(SYSTEM_ADMIN_ROLES), controller.create);
router.get('/', controller.list);
router.get('/:id', validateId, controller.getById);
router.get('/:id/content', validateId, controller.download);
router.patch('/:id', requireRole(SYSTEM_ADMIN_ROLES), validateId, controller.update);
router.delete('/:id', requireRole(SYSTEM_ADMIN_ROLES), validateId, controller.remove);

module.exports = router;
