"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("apparels");
    if (!columns.name) {
      await queryInterface.addColumn("apparels", "name", {
        type: Sequelize.STRING,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("apparels");
    if (columns.name) {
      await queryInterface.removeColumn("apparels", "name");
    }
  },
};
