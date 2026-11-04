module.exports = {
	up: async (queryInterface, Sequelize) => {
		const table = await queryInterface.describeTable('notifications');
		if (!Object.prototype.hasOwnProperty.call(table, 'event_key')) {
			await queryInterface.addColumn('notifications', 'event_key', {
				type: Sequelize.STRING,
				allowNull: true,
			});
		}
		const indexes = await queryInterface.showIndex('notifications');
		if (!indexes.some((index) => index.name === 'uq_notifications_user_event_key')) {
			await queryInterface.addIndex('notifications', ['user_id', 'event_key'], {
				name: 'uq_notifications_user_event_key',
				unique: true,
			});
		}
	},

	down: async (queryInterface) => {
		const indexes = await queryInterface.showIndex('notifications');
		if (indexes.some((index) => index.name === 'uq_notifications_user_event_key')) {
			await queryInterface.removeIndex('notifications', 'uq_notifications_user_event_key');
		}
		const table = await queryInterface.describeTable('notifications');
		if (Object.prototype.hasOwnProperty.call(table, 'event_key')) {
			await queryInterface.removeColumn('notifications', 'event_key');
		}
	},
};
