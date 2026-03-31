"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("apparels", "gs_util_raw", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("apparels", "gs_util_processed", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn("apparels", "gs_util_raw");
    await queryInterface.removeColumn("apparels", "gs_util_processed");
  },
};
