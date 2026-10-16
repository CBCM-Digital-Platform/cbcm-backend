// src/routes/index.js
const express = require('express');
const messagingRoutes = require('./messaging.routes');
// const learningRoutes = require('./learning.routes'); // TODO: Add when learning module is implemented
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');
const facilitiesRoutes = require('./facilities.routes');
const cyclesRoutes = require('./cycles.routes');
const thematicAreasRoutes = require('./thematic-areas.routes');
const assignmentsRoutes = require('./assignments.routes');
// const progressRoutes = require('./progress.routes'); // TODO: Add when progress module is implemented

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/messages', messagingRoutes);
// router.use('/learning', learningRoutes); // TODO: Add when learning module is implemented
router.use('/facilities', facilitiesRoutes);
router.use('/mentorship-cycles', cyclesRoutes);
router.use('/thematic-areas', thematicAreasRoutes);
router.use('/assignments', assignmentsRoutes);
// router.use('/progress', progressRoutes); // TODO: Add when progress module is implemented

module.exports = router;
