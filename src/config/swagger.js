const swaggerJSDoc = require('swagger-jsdoc');
const env = require('./env');

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'CBCM Backend API',
    version: '1.0.0',
    description: 'CBCM authentication, user management, and profile APIs.',
  },
  servers: [
    { url: `http://localhost:${env.PORT || 5000}`, description: 'Local development server' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'A clear error message' },
              details: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
      SuccessResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'object' },
          meta: { type: 'object' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'user@example.com' },
          password: { type: 'string', example: 'StrongPass1!' },
        },
      },
      RefreshTokenRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', example: 'opaque-refresh-token' },
        },
      },
      UserProfile: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          full_name: { type: 'string', example: 'Jane Doe' },
          email: { type: 'string', format: 'email', example: 'jane@example.com' },
          role: { type: 'string', example: 'mentee' },
          status: { type: 'string', example: 'active' },
          facility_id: { type: 'integer', nullable: true },
          highest_qualification: { type: 'string', nullable: true },
          training_status: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          avatar_url: { type: 'string', nullable: true },
          must_change_password: { type: 'boolean', example: false },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};

const options = {
  definition: swaggerDefinition,
  apis: ['./src/routes/*.js'],
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = { swaggerSpec };
