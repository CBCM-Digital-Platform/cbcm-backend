require('dotenv').config();

const app = require('./app');
const env = require('./config/env');

if (!env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET.length < 32) {
  throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters before starting the server.');
}

const PORT = env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});