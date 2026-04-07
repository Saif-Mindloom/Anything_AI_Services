"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("users");
    if (!columns.gs_util) {
      await queryInterface.addColumn("users", "gs_util", {
        type: Sequelize.TEXT,
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("users");
    if (columns.gs_util) {
      await queryInterface.removeColumn("users", "gs_util");
    }
  },
};
