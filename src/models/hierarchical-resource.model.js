module.exports = (sequelize, DataTypes) => sequelize.define('HierarchicalResource', {
	id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
	title: { type: DataTypes.STRING(255), allowNull: false },
	description: { type: DataTypes.TEXT, allowNull: true },
	type: { 
		type: DataTypes.ENUM('pdf', 'audio', 'video'), 
		allowNull: false 
	},
	uploaded_file_id: { type: DataTypes.INTEGER, allowNull: true },
	original_filename: { type: DataTypes.STRING(255), allowNull: true },
	verified_mime_type: { type: DataTypes.STRING(100), allowNull: true },
	file_size_bytes: { type: DataTypes.BIGINT, allowNull: true },
	upload_status: { 
		type: DataTypes.ENUM('pending', 'completed', 'failed'), 
		default: 'pending',
		allowNull: false 
	},
	publication_status: { 
		type: DataTypes.ENUM('draft', 'published', 'archived'), 
		default: 'draft',
		allowNull: false 
	},
	created_by: { type: DataTypes.INTEGER, allowNull: false },
	updated_by: { type: DataTypes.INTEGER, allowNull: true },
	archived_at: { type: DataTypes.DATE, allowNull: true },
	archived_by: { type: DataTypes.INTEGER, allowNull: true },
	created_at: { type: DataTypes.DATE, allowNull: false },
	updated_at: { type: DataTypes.DATE, allowNull: false },
}, { 
	tableName: 'hierarchical_resources', 
	timestamps: true, 
	createdAt: 'created_at', 
	updatedAt: 'updated_at' 
});
