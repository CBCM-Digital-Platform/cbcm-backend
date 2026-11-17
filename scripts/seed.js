'use strict';

require('dotenv').config();
const { sequelize, News, User } = require('../src/models');

async function seedNewsItems() {
  const author = await User.findOne({ where: { role: 'admin' } });
  if (!author) {
    throw new Error('A development admin user is required before seeding news.');
  }

  const now = new Date();
  const samples = [
    {
      title: 'Community Midwifery Update',
      slug: 'community-midwifery-update',
      summary: 'Highlights from our latest community midwifery programme.',
      content: '## Community update\n\nOur teams continue to support respectful, evidence-informed maternity care.',
      category: 'Community',
      status: 'published',
      published_at: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      title: 'New Learning Resources Available',
      slug: 'new-learning-resources-available',
      summary: 'New learning materials are available for mentors and mentees.',
      content: 'We have added practical resources to support continued learning and discussion.',
      category: 'Learning',
      status: 'published',
      published_at: new Date(now.getTime() - 24 * 60 * 60 * 1000),
    },
    {
      title: 'Maternal Health Partnership',
      slug: 'maternal-health-partnership',
      summary: 'Partners are working together to strengthen maternal health services.',
      content: 'The partnership will focus on collaboration, skills development, and quality improvement.',
      category: 'Partnerships',
      status: 'published',
      published_at: now,
    },
    {
      title: 'Upcoming Editorial',
      slug: 'upcoming-editorial',
      summary: 'A draft item for the next platform update.',
      content: 'This unpublished draft is available to administrators for editing.',
      category: 'Updates',
      status: 'draft',
      published_at: null,
    },
  ];

  for (const sample of samples) {
    await News.findOrCreate({
      where: { slug: sample.slug },
      defaults: { ...sample, author_id: author.id },
    });
  }
}

async function runSeeders() {
  try {
    if ((process.env.NODE_ENV || 'development') !== 'development') {
      throw new Error('scripts/seed.js is for development only.');
    }

    console.log('Connecting to database...');
    await sequelize.authenticate();
    console.log('Database connection established.');

    console.log('Running seeders...');
    await sequelize.sync();
    
    // Run roles seeder
    const rolesSeeder = require('../src/database/seeders/roles.seeder');
    await rolesSeeder.up(sequelize.getQueryInterface(), sequelize.Sequelize);
    console.log('✓ Roles seeded');

    // Run admin user seeder
    const adminSeeder = require('../src/database/seeders/admin-user.seeder');
    await adminSeeder.up(sequelize.getQueryInterface(), sequelize.Sequelize);
    console.log('✓ Admin user seeded');

    await seedNewsItems();
    console.log('✓ Development news seeded');

    console.log('\nSeed completed successfully!');
    console.log('Login credentials:');
    console.log('  Email: admin@cbcm.org');
    console.log('  Password: Admin@123');
    console.log('  (You will be required to change this password on first login)');
    
  } catch (error) {
    console.error('Error running seeders:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runSeeders();
