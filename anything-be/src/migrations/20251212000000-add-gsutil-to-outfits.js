"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");
    if (!columns.gs_util) {
      await queryInterface.addColumn("outfits", "gs_util", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");
    if (columns.gs_util) {
      await queryInterface.removeColumn("outfits", "gs_util");
    }
  },
};
