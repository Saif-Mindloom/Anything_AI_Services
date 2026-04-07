"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const columns = await queryInterface.describeTable("outfits");
    if (!columns.outfit_summary) {
      await queryInterface.addColumn("outfits", "outfit_summary", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!columns.accessories_summary) {
      await queryInterface.addColumn("outfits", "accessories_summary", {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
  },

  down: async (queryInterface, Sequelize) => {
    const columns = await queryInterface.describeTable("outfits");
    if (columns.outfit_summary) {
      await queryInterface.removeColumn("outfits", "outfit_summary");
    }
    if (columns.accessories_summary) {
      await queryInterface.removeColumn("outfits", "accessories_summary");
    }
  },
};
