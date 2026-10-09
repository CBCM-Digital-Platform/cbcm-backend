'use strict';

const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface, Sequelize) {
    const passwordHash = await bcrypt.hash('Admin@123', 12);
    
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
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('users', {
      email: 'admin@cbcm.org'
    });
  }
};
