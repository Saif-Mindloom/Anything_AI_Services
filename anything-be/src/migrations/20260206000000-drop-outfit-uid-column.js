"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Drop the outfit_uid column from outfits table
    await queryInterface.removeColumn("outfits", "outfit_uid");
  },

  down: async (queryInterface, Sequelize) => {
    // Add back outfit_uid column (for rollback)
    await queryInterface.addColumn("outfits", "outfit_uid", {
      type: Sequelize.BIGINT,
      allowNull: true, // Allow null during restoration
      unique: true,
    });
  },
};
