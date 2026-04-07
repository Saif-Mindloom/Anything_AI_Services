'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");
    if (!columns.outerwear_id) {
      await queryInterface.addColumn("outfits", "outerwear_id", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");
    if (columns.outerwear_id) {
      await queryInterface.removeColumn("outfits", "outerwear_id");
    }
  },
};
