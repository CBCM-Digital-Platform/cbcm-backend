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

4. Run database migrations (creates admin user):
```bash
npm run migrate
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

The admin user is created via database migration:

**Run migrations:**
```bash
npm run migrate
```

This will:
- Create all database tables
- Seed the initial admin user
- Email: `admin@cbcm.org`
- Password: `Admin@123`
- You will be required to change this password on first login

**Undo migrations (if needed):**
```bash
npm run migrate:undo
```

The migration is idempotent - it checks if the admin user already exists before creating, so it's safe to run multiple times.

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

### Learning Base
- `GET /api/v1/learning/modules` - List learning modules
- `POST /api/v1/learning/modules` - Create learning module (System Admin only)
- `GET /api/v1/learning/modules/:id` - Get module details
- `PATCH /api/v1/learning/modules/:id` - Partially update module (Admins only)
- `PUT /api/v1/learning/modules/:id` - Replace module (Admins only)
- `DELETE /api/v1/learning/modules/:id` - Delete module (Admins only)
- `GET /api/v1/learning/modules/:moduleId/contents` - List module content items
- `POST /api/v1/learning/modules/:moduleId/contents` - Add content item (Admins only)
- `GET /api/v1/learning/modules/:moduleId/contents/:contentId` - Get content item
- `PATCH /api/v1/learning/modules/:moduleId/contents/:contentId` - Update content item (Admins only)
- `DELETE /api/v1/learning/modules/:moduleId/contents/:contentId` - Delete content item (Admins only)
- `GET /api/v1/learning/modules/:moduleId/mentor-permissions` - List mentor module permissions (System Admin and Facility Admin)
- `POST /api/v1/learning/modules/:moduleId/mentor-permissions` - Grant mentor module permission (Facility Admin only, within their facility)
- `DELETE /api/v1/learning/modules/:moduleId/mentor-permissions/:mentorId` - Revoke mentor module access (Facility Admin only, within their facility)
- `GET /api/v1/learning/mentees/:menteeId/modules` - List modules assigned to mentee
- `GET /api/v1/learning/my/modules` - List modules for authenticated mentee
- `GET /api/v1/learning/my/modules/:moduleId` - Get mentee module progress
- `GET /api/v1/learning/my/modules/:moduleId/contents/progress` - Get content completion progress
- `POST /api/v1/learning/my/modules/:moduleId/contents/:contentId/complete` - Mark content item as completed
- `POST /api/v1/learning/my/modules/:moduleId/confirm-completion` - Confirm module completion
- `POST /api/v1/learning/modules/:moduleId/resources/:resourceId/assignments` - Assign an individual resource to a mentee (Mentors only)
- `GET /api/v1/learning/modules/:moduleId/resources/:resourceId/assignments` - List resource assignment history and progress (Mentors only)
- `GET /api/v1/learning/mentees/:menteeId/resources` - List a mentee's resource assignments (Assigned mentor only)
- `POST /api/v1/learning/resource-assignments/:assignmentId/revoke` - Revoke an individual resource assignment
- `GET /api/v1/learning/modules/:moduleId/quiz` - Get quiz for module (Mentees only)
- `POST /api/v1/learning/modules/:moduleId/quizzes` - Create quiz for module (Admins only)
- `PATCH /api/v1/learning/quizzes/:quizId` - Update quiz (Admins only)
- `POST /api/v1/learning/quizzes/:quizId/start` - Start quiz attempt (Mentees only)
- `POST /api/v1/learning/quizzes/:quizId/submit` - Submit quiz attempt answers (Mentees only)
- `GET /api/v1/learning/quizzes/:quizId/results` - Get quiz results (Mentees only)
- `GET /api/v1/learning/quizzes/:quizId/attempts` - List quiz attempts (Mentees only)
- `GET /api/v1/learning/quizzes/:quizId/answer-key` - View quiz answer key (Admins and authorized Mentors)
- `GET /api/v1/learning/quizzes/:quizId/questions` - List quiz questions (Admins only)
- `POST /api/v1/learning/quizzes/:quizId/questions` - Add question to quiz (Admins only)
- `PUT /api/v1/learning/quizzes/:quizId/questions/:questionId` - Update question (Admins only)
- `DELETE /api/v1/learning/quizzes/:quizId/questions/:questionId` - Delete question (Admins only)
- `POST /api/v1/learning/questions/:questionId/options` - Add option to question (Admins only)
- `PUT /api/v1/learning/questions/:questionId/options/:optionId` - Update option (Admins only)
- `DELETE /api/v1/learning/questions/:questionId/options/:optionId` - Delete option (Admins only)

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

### Build Command on Render

```
npm install && npm run migrate
```

This will install dependencies and run database migrations (including creating the admin user) on every deployment.

The migration is idempotent - it will skip creating the admin user if they already exist, so it's safe to run on every deployment.

### Start Command

```
node src/server.js
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

1. **Change default admin password immediately** - The default password `Admin@123` is in the migration file for initial setup. Change it on first login.
2. **For production deployments** - Consider modifying the migration file with a custom password before first deployment, or change it immediately after login.
3. **Use strong secrets** - JWT secrets should be at least 32 characters
4. **Environment variables** - Never commit `.env` file to version control
5. **Database URL** - Use a secure connection string in production
6. **CORS** - Restrict `CORS_ORIGIN` to your frontend domain in production
7. **Password change required** - The seeded admin user must change password on first login (`must_change_password: true`)

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

- Ensure you've run database migrations: `npm run migrate`
- Check the email and password are correct (admin@cbcm.org / Admin@123)
- Verify the database connection is working
- Check if the admin user exists in the database

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
