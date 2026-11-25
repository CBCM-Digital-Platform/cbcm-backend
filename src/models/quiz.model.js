module.exports = (sequelize, DataTypes) => sequelize.define('Quiz', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	// Legacy module ownership is retained for historical rows. New quizzes are
	// owned by a thematic area and may be shared by all of its modules.
	module_id: { type: DataTypes.INTEGER, allowNull: true },
	thematic_area_id: { type: DataTypes.INTEGER, allowNull: true },
	title: { type: DataTypes.STRING, allowNull: false },
	description: { type: DataTypes.TEXT },
	assessment_stage: {
		type: DataTypes.STRING,
		allowNull: true,
		defaultValue: null,
		validate: { isIn: [['PRETEST', 'POST_TEST']] },
	},
	assessment_component: {
		type: DataTypes.STRING,
		allowNull: true,
		defaultValue: null,
		validate: {
			isIn: [['pre_test', 'post_test', 'criteria', 'theory', null]],
		},
	},
	pass_score: { type: DataTypes.FLOAT, defaultValue: 0 },
	time_limit_minutes: { type: DataTypes.INTEGER, defaultValue: 0 },
	attempt_limit: { type: DataTypes.INTEGER, defaultValue: 1 },
	is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
	is_authorized: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
	created_by: { type: DataTypes.INTEGER },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'quizzes', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
