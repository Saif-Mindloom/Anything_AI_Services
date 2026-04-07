"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("users");
    if (!columns.gender) {
      await queryInterface.addColumn("users", "gender", {
        type: Sequelize.ENUM("male", "female", "other"),
        allowNull: true,
        defaultValue: null,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("users");
    if (columns.gender) {
      await queryInterface.removeColumn("users", "gender");
    }
    // Also drop the ENUM type to completely clean up
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_users_gender";'
    );
  },
};
