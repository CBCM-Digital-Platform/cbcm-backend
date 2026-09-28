module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },

      full_name: {
        type: DataTypes.STRING,
      },

      email: {
        type: DataTypes.STRING,
        unique: true,
      },

      phone: {
        type: DataTypes.STRING,
      },

      password_hash: {
        type: DataTypes.STRING,
      },

      role: {
        type: DataTypes.STRING,
      },

      facility_id: {
        type: DataTypes.INTEGER,
      },

      highest_qualification: {
        type: DataTypes.STRING,
      },

      training_status: {
        type: DataTypes.STRING,
      },

      avatar_url: {
        type: DataTypes.STRING,
      },

      status: {
        type: DataTypes.STRING,
      },

      must_change_password: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },

      password_changed_at: {
        type: DataTypes.DATE,
      },

      created_by: {
        type: DataTypes.INTEGER,
      },

      updated_by: {
        type: DataTypes.INTEGER,
      },

      created_at: {
        type: DataTypes.DATE,
      },

      updated_at: {
        type: DataTypes.DATE,
      },
    },
    {
      tableName: 'users',
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    }
  );

  return User;
};