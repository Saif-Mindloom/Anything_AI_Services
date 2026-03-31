"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add 'earings' to the accessory_type ENUM
    await queryInterface.sequelize.query(`
      ALTER TYPE "enum_accessories_accessory_type" 
      ADD VALUE IF NOT EXISTS 'earings';
    `);
  },

  async down(queryInterface, Sequelize) {
    // Note: PostgreSQL doesn't support removing ENUM values directly
    // To rollback, you would need to recreate the ENUM type without 'earings'
    // This is a complex operation that requires:
    // 1. Creating a new ENUM type without 'earings'
    // 2. Converting the column to use the new type
    // 3. Dropping the old type
    // 4. Renaming the new type

    // For safety, we'll leave this empty and document that rolling back
    // requires manual intervention if needed
    console.log(
      "WARNING: Rolling back ENUM value addition requires manual intervention",
    );
  },
};
