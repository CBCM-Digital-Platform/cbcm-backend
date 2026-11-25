module.exports = (sequelize, DataTypes) => sequelize.define('PracticalChecklistItem', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	checklist_id: { type: DataTypes.INTEGER, allowNull: false },
	item_text: { type: DataTypes.STRING, allowNull: false },
	sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
	is_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
	is_critical: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
	created_at: { type: DataTypes.DATE },
	updated_at: { type: DataTypes.DATE },
}, { tableName: 'practical_checklist_items', timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at' });
