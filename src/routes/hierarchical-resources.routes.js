const express = require('express');
const authenticate = require('../middlewares/auth/authenticate.middleware');
const requireRole = require('../middlewares/auth/require-role.middleware');
const { SYSTEM_ADMIN_ROLES, FACILITY_ADMIN_ROLES } = require('../constants/roles.constants');
const { resourceUpload, mapMulterError } = require('../config/multer');
const controller = require('../controllers/hierarchical-resources.controller');

const router = express.Router();

const uploadFile = (req, res, next) => {
	resourceUpload.single('file')(req, res, (err) => {
		if (err) return next(mapMulterError(err));
		next();
	});
};

router.use(authenticate);

// Super Admin only
router.post('/', requireRole(SYSTEM_ADMIN_ROLES), uploadFile, controller.create);
router.post('/:id/grant-facility', requireRole(SYSTEM_ADMIN_ROLES), controller.grantToFacility);
router.delete('/:id/facilities/:facilityId', requireRole(SYSTEM_ADMIN_ROLES), controller.revokeFromFacility);

// Facility Admin
router.post('/:id/grant-mentor', requireRole(FACILITY_ADMIN_ROLES), controller.grantToMentor);
router.delete('/:id/mentors/:mentorId', requireRole(FACILITY_ADMIN_ROLES), controller.revokeFromMentor);

// Mentor
router.post('/:id/assign-mentee', requireRole('mentor'), controller.assignToMentee);
router.delete('/:id/mentees/:menteeId', requireRole('mentor'), controller.revokeFromMentee);

// All authenticated users (with scoping in service)
router.get('/', controller.list);
router.get('/:id', controller.getById);
router.get('/:id/content', controller.download);

module.exports = router;
