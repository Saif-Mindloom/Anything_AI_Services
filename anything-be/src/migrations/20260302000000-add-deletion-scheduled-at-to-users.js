"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("users");
    if (!columns.deletion_scheduled_at) {
      await queryInterface.addColumn("users", "deletion_scheduled_at", {
        type: Sequelize.DATE,
        allowNull: true,
        defaultValue: null,
      });
    }

    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS "idx_users_deletion_scheduled_at" ON "users" ("deletion_scheduled_at") WHERE "deletion_scheduled_at" IS NOT NULL;'
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS "idx_users_deletion_scheduled_at";'
    );
    const columns = await queryInterface.describeTable("users");
    if (columns.deletion_scheduled_at) {
      await queryInterface.removeColumn("users", "deletion_scheduled_at");
    }
  },
};
