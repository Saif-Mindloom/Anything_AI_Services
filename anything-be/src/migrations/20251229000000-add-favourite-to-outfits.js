"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");
    if (!columns.favourite) {
      await queryInterface.addColumn("outfits", "favourite", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");
    if (columns.favourite) {
      await queryInterface.removeColumn("outfits", "favourite");
    }
  },
};

