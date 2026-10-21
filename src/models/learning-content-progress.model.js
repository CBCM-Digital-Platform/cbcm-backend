module.exports = (sequelize, DataTypes) => sequelize.define('LearningContentProgress', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	mentee_id: { type: DataTypes.INTEGER, allowNull: false },
	module_id: { type: DataTypes.INTEGER, allowNull: false },
	content_id: { type: DataTypes.INTEGER, allowNull: false },
	completed_at: { type: DataTypes.DATE, allowNull: false },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, {
	tableName: 'learning_content_progress',
	timestamps: true,
	createdAt: 'created_at',
	updatedAt: 'updated_at',
	indexes: [{ unique: true, fields: ['mentee_id', 'content_id'] }],
});
