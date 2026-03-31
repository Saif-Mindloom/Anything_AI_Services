"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn("outfits", "outfit_summary", {
      type: Sequelize.TEXT,
      allowNull: true,
    });

    await queryInterface.addColumn("outfits", "accessories_summary", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn("outfits", "outfit_summary");
    await queryInterface.removeColumn("outfits", "accessories_summary");
  },
};
