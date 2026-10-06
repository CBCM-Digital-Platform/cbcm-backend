# CBCM Backend API

Backend API for the CBCM (Clinical Based Clinical Mentoring) Digital Platform.

## Features

- User authentication with JWT tokens
- Role-based access control (admin, facility_admin, mentor, mentee)
- Password management (change, reset, forgot password)
- Refresh token rotation
- API documentation with Swagger UI

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Configure environment variables (create `.env` file):
```env
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://username:password@host:5432/database
JWT_ACCESS_SECRET=your-secret-at-least-32-characters
JWT_REFRESH_SECRET=your-refresh-secret-at-least-32-characters
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
PASSWORD_RESET_EXPIRES_IN=1h
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=*
```

### Running Locally

1. Start the development server:
```bash
npm run dev
```

2. The server will start on port 5000 and you'll see:
```
✓ Database connection established successfully
✓ Server running on port 5000
✓ API Documentation: http://localhost:5000/api/docs
```

3. Visit the API documentation:
   - Swagger UI: http://localhost:5000/api/docs
   - Health check: http://localhost:5000/

### Seeding Initial Admin User

**For local development:**
```bash
npm run seed
```

This creates an initial Super Admin:
- Email: `admin@cbcm.org`
- Password: `Admin@123`
- You will be required to change this password on first login

**For production (Render):**
```bash
npm run seed:production
```

This is a safe seed script that:
- Checks if admin already exists before creating
- Won't duplicate users if run multiple times
- Can be run as a post-deploy hook on Render

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - Login with email and password
- `POST /api/v1/auth/refresh-token` - Refresh access token
- `POST /api/v1/auth/logout` - Logout and revoke tokens
- `POST /api/v1/auth/forgot-password` - Request password reset
- `POST /api/v1/auth/reset-password` - Reset password with token
- `POST /api/v1/auth/change-password` - Change authenticated user's password
- `GET /api/v1/auth/session` - Validate current session

### Users
- `GET /api/v1/users/me` - Get current user profile
- `PATCH /api/v1/users/me` - Update current user profile
- `GET /api/v1/users/me/preferences` - Get user preferences
- `PATCH /api/v1/users/me/preferences` - Update user preferences
- `GET /api/v1/users` - List users (admin only)
- `GET /api/v1/users/:id` - Get user by ID (admin only)
- `POST /api/v1/users` - Create user (admin only)
- `PATCH /api/v1/users/:id/status` - Update user status (admin only)

## Deployment to Render

### Environment Variables on Render

Set these in your Render dashboard:

```
NODE_ENV=production
PORT=5000
DATABASE_URL=<your-database-url>
JWT_ACCESS_SECRET=<32+ character secret>
JWT_REFRESH_SECRET=<32+ character secret>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
PASSWORD_RESET_EXPIRES_IN=1h
FRONTEND_URL=<your-frontend-url>
CORS_ORIGIN=*
```

### Build Command
```
npm install
```

### Start Command
```
node src/server.js
```

### Post-Deploy Hook (Optional but Recommended)

Add a post-deploy hook to seed the admin user:

```bash
npm run seed:production
```

This ensures the admin user exists after every deployment.

## Important Security Notes

1. **Change default password immediately** - The seeded admin password is for initial setup only
2. **Use strong secrets** - JWT secrets should be at least 32 characters
3. **Environment variables** - Never commit `.env` file to version control
4. **Database URL** - Use a secure connection string in production
5. **CORS** - Restrict `CORS_ORIGIN` to your frontend domain in production

## Testing

### Login Test

```bash
curl -X POST http://localhost:5000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@cbcm.org","password":"Admin@123"}'
```

### Health Check

```bash
curl http://localhost:5000/
```

## Troubleshooting

### Login fails with "INVALID_CREDENTIALS"

- Ensure you've run the seed script: `npm run seed` (local) or `npm run seed:production` (Render)
- Check the email and password are correct
- Verify the database connection is working

### Database connection errors

- Check your `DATABASE_URL` is correct
- Ensure the database server is accessible
- Verify SSL settings if using PostgreSQL

### JWT errors

- Ensure `JWT_ACCESS_SECRET` is at least 32 characters
- Check the secret matches between deployments
- Verify the token hasn't expired

## Project Structure

```
cbcm-backend/
├── src/
│   ├── config/          # Configuration files
│   ├── controllers/     # Route controllers
│   ├── database/        # Database connection and seeders
│   ├── enums/           # Enum definitions
│   ├── errors/          # Custom error classes
│   ├── middlewares/     # Express middlewares
│   ├── models/          # Sequelize models
│   ├── repositories/    # Data access layer
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   ├── utils/           # Utility functions
│   ├── validators/      # Request validators
│   ├── app.js           # Express app setup
│   └── server.js        # Server entry point
├── scripts/             # Utility scripts
├── tests/               # Test files
└── package.json
```

## License

ISC
