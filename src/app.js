const express = require('express');
const cors = require('cors');
const { swaggerSpec } = require('./config/swagger');
const swaggerUi = require('swagger-ui-express');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error-handler.middleware');
const env = require('./config/env');

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.use('/api/v1', routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
module.exports.createApp = () => app;
