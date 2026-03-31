"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("users", "deletion_scheduled_at", {
      type: Sequelize.DATE,
      allowNull: true,
      defaultValue: null,
    });

    await queryInterface.addIndex("users", ["deletion_scheduled_at"], {
      name: "idx_users_deletion_scheduled_at",
      where: { deletion_scheduled_at: { [Sequelize.Op.ne]: null } },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeIndex(
      "users",
      "idx_users_deletion_scheduled_at"
    );
    await queryInterface.removeColumn("users", "deletion_scheduled_at");
  },
};
