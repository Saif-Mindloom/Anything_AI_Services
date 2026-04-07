"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("apparels");
    if (!columns.gs_util_raw) {
      await queryInterface.addColumn("apparels", "gs_util_raw", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!columns.gs_util_processed) {
      await queryInterface.addColumn("apparels", "gs_util_processed", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("apparels");
    if (columns.gs_util_raw) {
      await queryInterface.removeColumn("apparels", "gs_util_raw");
    }
    if (columns.gs_util_processed) {
      await queryInterface.removeColumn("apparels", "gs_util_processed");
    }
  },
};
