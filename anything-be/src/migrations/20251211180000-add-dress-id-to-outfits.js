"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if column already exists
    const tableDescription = await queryInterface.describeTable("outfits");

    if (!tableDescription.dress_id) {
      await queryInterface.addColumn("outfits", "dress_id", {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: "apparels",
          key: "id",
        },
        onDelete: "SET NULL",
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableDescription = await queryInterface.describeTable("outfits");

    if (tableDescription.dress_id) {
      await queryInterface.removeColumn("outfits", "dress_id");
    }
  },
};
