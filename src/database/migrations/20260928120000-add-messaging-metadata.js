'use strict';

const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.addColumn('conversations', 'type', {
      type: Sequelize.STRING,
      allowNull: false,
      defaultValue: 'direct',
    });
    await queryInterface.addColumn('conversations', 'last_message_id', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('conversations', 'last_message_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('conversations', 'updated_at', {
      type: Sequelize.DATE,
      allowNull: false,
      defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
    });
    await queryInterface.addConstraint('conversations', {
      fields: ['last_message_id'],
      type: 'foreign key',
      name: 'fk_conversations_last_message_id_messages',
      references: { table: 'messages', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
    await queryInterface.addIndex('conversations', ['last_message_at'], {
      name: 'idx_conversations_last_message_at',
    });
    await queryInterface.removeIndex('message_reads', 'idx_message_reads_message_id_user_id');
    await queryInterface.addIndex('message_reads', ['message_id', 'user_id'], {
      unique: true,
      name: 'idx_message_reads_message_id_user_id',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('message_reads', 'idx_message_reads_message_id_user_id');
    await queryInterface.addIndex('message_reads', ['message_id', 'user_id'], {
      name: 'idx_message_reads_message_id_user_id',
    });
    await queryInterface.removeIndex('conversations', 'idx_conversations_last_message_at');
    await queryInterface.removeConstraint('conversations', 'fk_conversations_last_message_id_messages');
    await queryInterface.removeColumn('conversations', 'updated_at');
    await queryInterface.removeColumn('conversations', 'last_message_at');
    await queryInterface.removeColumn('conversations', 'last_message_id');
    await queryInterface.removeColumn('conversations', 'type');
  },
};