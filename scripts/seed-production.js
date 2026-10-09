'use strict';

require('dotenv').config();
const { User } = require('../src/models');
const bcrypt = require('bcryptjs');

async function seedProduction() {
  try {
    console.log('Connecting to database...');
    await User.sequelize.authenticate();
    console.log('✓ Database connection established');

    // Check if admin user already exists
    const existingAdmin = await User.findOne({
      where: { email: 'admin@cbcm.org' }
    });

    if (existingAdmin) {
      console.log('✓ Admin user already exists, skipping seed');
      console.log('  Email: admin@cbcm.org');
      return;
    }

    // Create admin user
    const passwordHash = await bcrypt.hash('Admin@123', 12);
    
    await User.create({
      full_name: 'Super Admin',
      email: 'admin@cbcm.org',
      password_hash: passwordHash,
      role: 'admin',
      status: 'active',
      must_change_password: true,
      password_changed_at: new Date(),
    });

    console.log('✓ Admin user created successfully');
    console.log('  Email: admin@cbcm.org');
    console.log('  Password: Admin@123');
    console.log('  (You will be required to change this password on first login)');
    
  } catch (error) {
    console.error('✗ Error seeding production database:', error.message);
    process.exit(1);
  } finally {
    await User.sequelize.close();
  }
}

seedProduction();
