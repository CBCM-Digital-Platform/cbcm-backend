// src/routes/index.js
const express = require('express');
const messagingRoutes = require('./messaging.routes');
// const learningRoutes = require('./learning.routes'); // TODO: Add when learning module is implemented
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const facilitiesRoutes = require('./facilities.routes');
const cyclesRoutes = require('./cycles.routes');

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/messages', messagingRoutes);
// router.use('/learning', learningRoutes); // TODO: Add when learning module is implemented
router.use('/facilities', facilitiesRoutes);
router.use('/mentorship-cycles', cyclesRoutes);

module.exports = router;
