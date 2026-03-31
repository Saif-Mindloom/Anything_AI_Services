"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'dress' to the category enum
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_apparels_category" ADD VALUE IF NOT EXISTS 'dress';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't support removing enum values directly
    // You would need to recreate the enum type to remove a value
    console.log(
      "Cannot remove enum value in PostgreSQL. Manual intervention required if rollback is needed."
    );
  },
};
