"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");
    if (!columns.has_accessories) {
      await queryInterface.addColumn("outfits", "has_accessories", {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");
    if (columns.has_accessories) {
      await queryInterface.removeColumn("outfits", "has_accessories");
    }
  },
};
