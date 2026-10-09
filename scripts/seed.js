'use strict';

require('dotenv').config();
const { sequelize } = require('../src/models');

async function runSeeders() {
  try {
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
