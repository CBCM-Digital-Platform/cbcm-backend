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

// Health check / welcome endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'CBCM Backend API is running',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      health: '/',
      api: '/api/v1',
      docs: '/api/docs'
    }
  });
});

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  swaggerOptions: {
    persistAuthorization: true,
    tryItOutEnabled: true,
  },
  customSiteTitle: 'CBCM API Documentation',
}));
app.use('/api/v1', routes);
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
module.exports.createApp = () => app;
