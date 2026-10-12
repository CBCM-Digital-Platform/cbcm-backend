require('dotenv').config();

const app = require('./app');
const env = require('./config/env');
const sequelize = require('./database/connection');

if (!env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < 32) {
  throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters before starting the server.');
}

const PORT = env.PORT || 5000;

async function startServer() {
  try {
    // Test database connection
    await sequelize.authenticate();
    console.log('✓ Database connection established successfully');

    const baseUrl = env.PUBLIC_BASE_URL || `http://localhost:${PORT}`;

    app.listen(PORT, () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ API Documentation: ${baseUrl}/api/docs`);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error.message);
    process.exit(1);
  }
}

startServer();