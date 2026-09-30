// src/routes/index.js
const express = require('express');
const messagingRoutes = require('./messaging.routes');
const learningRoutes = require('./learning.routes');

const router = express.Router();

router.use('/messages', messagingRoutes);
router.use('/learning', learningRoutes);

module.exports = router;
