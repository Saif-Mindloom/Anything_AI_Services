"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // First, let's update any NULL timestamp values with current time
    await queryInterface.sequelize.query(
      "UPDATE users SET created_at = NOW() WHERE created_at IS NULL"
    );
    await queryInterface.sequelize.query(
      "UPDATE users SET updated_at = NOW() WHERE updated_at IS NULL"
    );

    // Remove duplicate camelCase columns that conflict with snake_case
    const tableDescription = await queryInterface.describeTable("users");

    // Drop camelCase columns if they exist (these are duplicates)
    if (tableDescription.createdAt) {
      await queryInterface.removeColumn("users", "createdAt");
    }
    if (tableDescription.updatedAt) {
      await queryInterface.removeColumn("users", "updatedAt");
    }
    if (tableDescription.faceImages) {
      await queryInterface.removeColumn("users", "faceImages");
    }
    if (tableDescription.bodyImages) {
      await queryInterface.removeColumn("users", "bodyImages");
    }
    if (tableDescription.baseModelUrl) {
      await queryInterface.removeColumn("users", "baseModelUrl");
    }
    if (tableDescription.profileCompleted) {
      await queryInterface.removeColumn("users", "profileCompleted");
    }

    // Clean up duplicate email unique constraints
    const constraintQueries = [];
    for (let i = 1; i <= 21; i++) {
      constraintQueries.push(
        queryInterface.sequelize
          .query(
            `ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key${i}`
          )
          .catch(() => {
            // Ignore errors if constraint doesn't exist
          })
      );
    }

    await Promise.all(constraintQueries);
  },

  async down(queryInterface, Sequelize) {
    // This migration is not easily reversible due to data cleanup
    // If needed, you would need to recreate the duplicate columns
    console.log("This migration cleanup is not easily reversible");
  },
};
