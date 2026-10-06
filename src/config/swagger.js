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
        required: ['success', 'error'],
        properties: {
          success: { type: 'boolean', example: false },
          error: {
            type: 'object',
            required: ['code', 'message', 'details'],
            properties: {
              code: { type: 'string', example: 'VALIDATION_ERROR' },
              message: { type: 'string', example: 'A clear error message' },
              details: { type: 'array', items: { type: 'string' }, example: [] },
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
          email: { type: 'string', format: 'email', example: 'admin@cbcm.org' },
          password: { type: 'string', format: 'password', example: 'Admin@123' },
        },
      },
      RefreshTokenRequest: {
        type: 'object',
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', pattern: '^[a-f0-9]{64}$', example: '64-character opaque refresh token' },
        },
      },
      LoginResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            required: ['accessToken', 'refreshToken', 'user'],
            properties: {
              accessToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiJ9...' },
              accessTokenExpiresIn: { type: 'string', example: '15m' },
              refreshToken: { type: 'string', pattern: '^[a-f0-9]{64}$', example: '64-character opaque refresh token' },
              refreshTokenExpiresAt: { type: 'string', format: 'date-time', example: '2026-11-04T12:00:00.000Z' },
              user: { $ref: '#/components/schemas/UserProfile' },
            },
          },
          meta: { type: 'object', example: {} },
        },
      },
      MessageResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: { message: { type: 'string', example: 'If that email exists, a reset link will be sent.' } },
          },
          meta: { type: 'object', example: {} },
        },
      },
      BooleanActionResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: {
              reset: { type: 'boolean', example: true },
              changed: { type: 'boolean', example: true },
              revoked: { type: 'boolean', example: true },
            },
          },
          meta: { type: 'object', example: {} },
        },
      },
      RefreshTokenResponse: {
        $ref: '#/components/schemas/LoginResponse',
      },
      ForgotPasswordRequest: {
        type: 'object',
        required: ['email'],
        properties: { email: { type: 'string', format: 'email', example: 'user@example.com' } },
      },
      ResetPasswordRequest: {
        type: 'object',
        required: ['token', 'password'],
        properties: {
          token: { type: 'string', pattern: '^[a-f0-9]{64}$', example: '64-character one-time token delivered by email' },
          password: { type: 'string', format: 'password', minLength: 8, example: 'NewStrongPass2!' },
        },
      },
      ChangePasswordRequest: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', format: 'password' },
          newPassword: { type: 'string', format: 'password', minLength: 8, example: 'NewStrongPass2!' },
        },
      },
      LogoutRequest: {
        type: 'object',
        properties: { refreshToken: { type: 'string', pattern: '^[a-f0-9]{64}$', example: '64-character opaque refresh token' } },
      },
      UserProfile: {
        type: 'object',
        required: ['id', 'email', 'role', 'status'],
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
      UserProfileResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { $ref: '#/components/schemas/UserProfile' },
          meta: { type: 'object', example: {} },
        },
      },
      SessionResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: {
            type: 'object',
            properties: { user: { $ref: '#/components/schemas/UserProfile' } },
          },
          meta: { type: 'object', example: {} },
        },
      },
      UpdateProfileRequest: {
        type: 'object',
        minProperties: 1,
        properties: {
          full_name: { type: 'string', minLength: 2, example: 'Jane Doe' },
          phone: { type: 'string', minLength: 7, example: '+251911234567' },
          highest_qualification: { type: 'string', example: 'BSc Midwifery' },
          training_status: { type: 'string', example: 'in_training' },
          avatar_url: { type: 'string', format: 'uri', example: 'https://example.com/avatar.jpg' },
        },
        additionalProperties: false,
      },
      UserPreferences: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          user_id: { type: 'integer', example: 10 },
          language: { type: 'string', maxLength: 20, nullable: true, example: 'en' },
          theme: { type: 'string', enum: ['light', 'dark', 'system'], nullable: true, example: 'system' },
          notifications_enabled: { type: 'boolean', nullable: true, example: true },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      UpdateUserPreferencesRequest: {
        type: 'object',
        minProperties: 1,
        properties: {
          language: { type: 'string', maxLength: 20, example: 'en' },
          theme: { type: 'string', enum: ['light', 'dark', 'system'] },
          notifications_enabled: { type: 'boolean', example: true },
        },
        additionalProperties: false,
      },
      PreferencesResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { allOf: [{ $ref: '#/components/schemas/UserPreferences' }], nullable: true },
          meta: { type: 'object', example: {} },
        },
      },
      CreateUserRequest: {
        type: 'object',
        required: ['full_name', 'email', 'password', 'role'],
        properties: {
          full_name: { type: 'string', minLength: 1, example: 'Jane Doe' },
          email: { type: 'string', format: 'email', example: 'jane@example.com' },
          password: { type: 'string', format: 'password', minLength: 8, example: 'TemporaryPass1!' },
          role: { type: 'string', enum: ['admin', 'facility_admin', 'mentor', 'mentee'], example: 'mentee' },
          facility_id: { type: 'integer', minimum: 1, nullable: true, example: 2 },
          phone: { type: 'string', example: '+251911234567' },
          highest_qualification: { type: 'string', example: 'BSc Midwifery' },
          training_status: { type: 'string', example: 'in_training' },
          must_change_password: { type: 'boolean', default: true, example: true },
        },
        additionalProperties: false,
      },
      UpdateUserStatusRequest: {
        type: 'object',
        required: ['status'],
        properties: { status: { type: 'string', enum: ['active', 'inactive', 'suspended'], example: 'inactive' } },
      },
      UserListResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: true },
          data: { type: 'array', items: { $ref: '#/components/schemas/UserProfile' } },
          meta: {
            type: 'object',
            properties: {
              page: { type: 'integer', example: 1 },
              limit: { type: 'integer', example: 20 },
              total: { type: 'integer', example: 42 },
              totalPages: { type: 'integer', example: 3 },
            },
          },
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
