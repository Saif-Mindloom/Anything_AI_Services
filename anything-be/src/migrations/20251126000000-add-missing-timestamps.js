"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Check if createdAt column exists
    const tableDescription = await queryInterface.describeTable("users");

    if (!tableDescription.createdAt) {
      // First add the column as nullable with default value
      await queryInterface.addColumn("users", "createdAt", {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.NOW,
      });

      // Update any null values with current timestamp
      await queryInterface.sequelize.query(
        'UPDATE users SET "createdAt" = NOW() WHERE "createdAt" IS NULL'
      );

      // Now make the column NOT NULL
      await queryInterface.changeColumn("users", "createdAt", {
        type: Sequelize.DATE,
        allowNull: false,
      });
    }

    if (!tableDescription.updatedAt) {
      // First add the column as nullable with default value
      await queryInterface.addColumn("users", "updatedAt", {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: Sequelize.NOW,
      });

      // Update any null values with current timestamp
      await queryInterface.sequelize.query(
        'UPDATE users SET "updatedAt" = NOW() WHERE "updatedAt" IS NULL'
      );

      // Now make the column NOT NULL
      await queryInterface.changeColumn("users", "updatedAt", {
        type: Sequelize.DATE,
        allowNull: false,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Remove the columns if they exist
    const tableDescription = await queryInterface.describeTable("users");

    if (tableDescription.createdAt) {
      await queryInterface.removeColumn("users", "createdAt");
    }

    if (tableDescription.updatedAt) {
      await queryInterface.removeColumn("users", "updatedAt");
    }
  },
};
