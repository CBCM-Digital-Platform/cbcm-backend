// src/routes/index.js
const express = require('express');
const messagingRoutes = require('./messaging.routes');
const learningRoutes = require('./learning.routes');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const facilitiesRoutes = require('./facilities.routes');
const cyclesRoutes = require('./cycles.routes');
const notificationsRoutes = require('./notifications.routes');

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/messages', messagingRoutes);
router.use('/learning', learningRoutes);
router.use('/facilities', facilitiesRoutes);
router.use('/mentorship-cycles', cyclesRoutes);
router.use('/notifications', notificationsRoutes);

module.exports = router;
