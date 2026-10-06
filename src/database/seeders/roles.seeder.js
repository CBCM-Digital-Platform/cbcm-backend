'use strict';

// Roles are stored as enum strings in the users table, not as a separate table
// This seeder is a no-op but kept for consistency
module.exports = {
  async up(queryInterface, Sequelize) {
    console.log('Roles are enum values stored directly in users table - no seeding needed');
  },

  async down(queryInterface, Sequelize) {
    console.log('No roles table to clean up');
  }
};
