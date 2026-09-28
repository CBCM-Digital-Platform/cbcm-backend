module.exports = (sequelize, DataTypes) => sequelize.define('KnowledgeScoreSnapshot', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	mentee_id: { type: DataTypes.INTEGER },
	facility_id: { type: DataTypes.INTEGER },
	cycle_id: { type: DataTypes.INTEGER },
	thematic_area_id: { type: DataTypes.INTEGER },
	score: { type: DataTypes.FLOAT },
	competency_level: { type: DataTypes.STRING },
	triggered_by: { type: DataTypes.INTEGER },
	recorded_at: { type: DataTypes.DATE },
}, { tableName: 'knowledge_score_snapshots', timestamps: false });
