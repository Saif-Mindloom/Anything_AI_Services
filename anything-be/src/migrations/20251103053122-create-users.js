"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("users", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      dob: { type: Sequelize.STRING, allowNull: false },
      height: { type: Sequelize.INTEGER, allowNull: false },
      weight: { type: Sequelize.INTEGER, allowNull: false },
      faceImages: { type: Sequelize.JSON },
      bodyImages: { type: Sequelize.JSON },
      baseModelUrl: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("users");
  },
};
