module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('quiz_answer_key_applications', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      resource_id: { type: Sequelize.INTEGER, allowNull: false },
      answer_key_file_id: { type: Sequelize.INTEGER, allowNull: false },
      thematic_area_id: { type: Sequelize.INTEGER, allowNull: false },
      quiz_id: { type: Sequelize.INTEGER, allowNull: false },
      created_by: { type: Sequelize.INTEGER, allowNull: false },
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'uploaded' },
      proposed_answers: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      warnings: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      confirmed_at: { type: Sequelize.DATE },
      confirmed_by: { type: Sequelize.INTEGER },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('quiz_answer_key_applications', ['resource_id']);
    await queryInterface.addIndex('quiz_answer_key_applications', ['quiz_id']);
    await queryInterface.addIndex('quiz_answer_key_applications', ['thematic_area_id']);
  },
  async down(queryInterface) { await queryInterface.dropTable('quiz_answer_key_applications'); },
};
