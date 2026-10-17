'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('password_reset_tokens', 'failed_attempts', {
      type: Sequelize.INTEGER,
      defaultValue: 0,
      allowNull: false,
    });

    await queryInterface.addIndex('password_reset_tokens', ['user_id', 'expires_at'], {
      name: 'idx_password_reset_tokens_user_id_expires_at',
    });
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('password_reset_tokens', 'idx_password_reset_tokens_user_id_expires_at');
    await queryInterface.removeColumn('password_reset_tokens', 'failed_attempts');
  },
};
