"use strict";

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const columns = await queryInterface.describeTable("outfits");
    // Drop the outfit_uid column from outfits table only when present
    if (columns.outfit_uid) {
      await queryInterface.removeColumn("outfits", "outfit_uid");
    }
  },

  down: async (queryInterface, Sequelize) => {
    const columns = await queryInterface.describeTable("outfits");
    // Add back outfit_uid column (for rollback)
    if (!columns.outfit_uid) {
      await queryInterface.addColumn("outfits", "outfit_uid", {
        type: Sequelize.BIGINT,
        allowNull: true, // Allow null during restoration
        unique: true,
      });
    }
  },
};
