// src/app.js
const express = require('express');
const routes = require('./routes');
const errorHandler = require('./middlewares/error-handler.middleware');

const app = express();

app.use(express.json({ limit: '1mb' }));
app.use(routes);
app.use(errorHandler);

module.exports = app;
