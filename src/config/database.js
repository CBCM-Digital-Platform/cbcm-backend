const { Sequelize } = require('sequelize');

const sequelize = process.env.NODE_ENV === 'test'
  ? new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  : new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  });

module.exports = sequelize;