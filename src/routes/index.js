const express = require('express');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const facilitiesRoutes = require('./facilities.routes');
const cyclesRoutes = require('./cycles.routes');

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/facilities', facilitiesRoutes);
router.use('/mentorship-cycles', cyclesRoutes);

module.exports = router;
