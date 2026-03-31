"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    // Make DOB field nullable
    await queryInterface.changeColumn("users", "dob", {
      type: Sequelize.STRING,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Revert back to non-nullable (be careful with this in production)
    await queryInterface.changeColumn("users", "dob", {
      type: Sequelize.STRING,
      allowNull: false,
    });
  },
};
