'use strict';

const bcrypt = require('bcryptjs');

/** Seed initial admin user */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if admin user already exists to avoid duplicates
    const existingUsers = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email',
      {
        replacements: { email: 'admin@cbcm.org' },
        type: queryInterface.sequelize.QueryTypes.SELECT
      }
    );

    if (Array.isArray(existingUsers) && existingUsers.length > 0) {
      console.log('Admin user already exists, skipping seed');
      return;
    }

    const passwordHash = await bcrypt.hash('Admin@123', 12);

    try {
      await queryInterface.bulkInsert('users', [{
        full_name: 'Super Admin',
        email: 'admin@cbcm.org',
        password_hash: passwordHash,
        role: 'admin',
        status: 'active',
        must_change_password: true,
        password_changed_at: new Date(),
        created_at: new Date(),
        updated_at: new Date()
      }], {});

      console.log('✓ Admin user seeded successfully');
      console.log('  Email: admin@cbcm.org');
      console.log('  Password: Admin@123');
      console.log('  ⚠️  IMPORTANT: Change this password immediately after first login!');
    } catch (error) {
      // If it's a unique constraint error, the user already exists
      if (error.name === 'SequelizeUniqueConstraintError') {
        console.log('Admin user already exists (unique constraint), skipping seed');
        return;
      }
      throw error;
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', {
      email: 'admin@cbcm.org'
    });
  }
};
