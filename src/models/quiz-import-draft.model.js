module.exports = (sequelize, DataTypes) => sequelize.define('QuizImportDraft', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	module_id: { type: DataTypes.INTEGER, allowNull: false },
	question_file_id: { type: DataTypes.INTEGER, allowNull: false },
	answer_key_file_id: { type: DataTypes.INTEGER },
	created_by: { type: DataTypes.INTEGER, allowNull: false },
	status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'uploaded' },
	questions: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
	warnings: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
	quiz_id: { type: DataTypes.INTEGER },
	confirmed_at: { type: DataTypes.DATE },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'quiz_import_drafts', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
