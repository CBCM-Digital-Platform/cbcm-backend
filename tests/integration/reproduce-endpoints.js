const request = require('supertest');
const { createApp } = require('../../src/app');
const models = require('../../src/models');
const { generateAccessToken } = require('../../src/utils/token.util');

async function run() {
  const app = createApp();

  // Find or create an admin user
  let user = await models.User.findOne({ where: { role: 'admin' } });
  if (!user) {
    user = await models.User.create({
      full_name: 'Test Admin',
      email: `testadmin-${Date.now()}@example.com`,
      password_hash: 'hash',
      role: 'admin',
      status: 'active',
      must_change_password: false,
    });
  }

  const token = generateAccessToken(user);
  const bearer = `Bearer ${token}`;

  const endpoints = [
    { method: 'GET', url: '/api/v1/mentorship-cycles' },
    { method: 'GET', url: '/api/v1/mentorship-cycles/1' },
    { method: 'GET', url: '/api/v1/mentorship-cycles/1/facilities' },
    { method: 'GET', url: '/api/v1/mentorship-cycles/1/thematic-areas' },
    { method: 'GET', url: '/api/v1/assignments' },
    { method: 'GET', url: '/api/v1/assignments/1' },
    { method: 'GET', url: '/api/v1/assignments/mentees/1/assignments' },
    { method: 'GET', url: '/api/v1/assignments/mentors/1/assignments' },
    { method: 'GET', url: '/api/v1/progress/knowledge-snapshots' },
    { method: 'GET', url: '/api/v1/progress/knowledge-snapshots/1' },
    { method: 'GET', url: '/api/v1/progress/summary' },
    { method: 'GET', url: '/api/v1/progress/mentees/1/knowledge-snapshots' },
    { method: 'GET', url: '/api/v1/progress/mentees/1/competencies' },
  ];

  for (const ep of endpoints) {
    console.log(`\nTesting ${ep.method} ${ep.url}...`);
    try {
      const res = await request(app)
        .get(ep.url)
        .set('Authorization', bearer);
      console.log(`Status: ${res.status}`);
      console.log(`Body:`, JSON.stringify(res.body));
    } catch (err) {
      console.error(`Request failed with exception:`, err);
    }
  }

  await models.sequelize.close();
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
