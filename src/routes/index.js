// src/routes/index.js
const express = require('express');
const messagingRoutes = require('./messaging.routes');
const learningRoutes = require('./learning.routes');
const express = require('express');
const authRoutes = require('./auth.routes');
const usersRoutes = require('./users.routes');

const router = express.Router();
router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/messages', messagingRoutes);
router.use('/learning', learningRoutes);
module.exports = router;
