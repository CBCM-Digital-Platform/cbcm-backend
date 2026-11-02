const express = require('express');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { SYSTEM_ADMIN_ROLES } = require('../constants/roles.constants');
const { uploadResourceFile } = require('../middlewares/upload.middleware');
const controller = require('../controllers/uploads.controller');
const { parseId } = require('../validators/uploads.validator');

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
router.post('/', requireRole(SYSTEM_ADMIN_ROLES), uploadResourceFile, controller.create);
router.get('/:id', requireRole(SYSTEM_ADMIN_ROLES), validateId, controller.getById);
router.get('/:id/content', requireRole(SYSTEM_ADMIN_ROLES), validateId, controller.download);
router.delete('/:id', requireRole(SYSTEM_ADMIN_ROLES), validateId, controller.remove);

module.exports = router;
