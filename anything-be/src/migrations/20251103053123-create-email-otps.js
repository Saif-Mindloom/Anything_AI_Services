"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Make migration resilient in partially-migrated environments.
    let tableExists = true;
    try {
      await queryInterface.describeTable("email_otps");
    } catch (error) {
      tableExists = false;
    }

    if (!tableExists) {
      await queryInterface.createTable("email_otps", {
        id: {
          type: Sequelize.UUID,
          defaultValue: Sequelize.UUIDV4,
          primaryKey: true,
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: "users",
            key: "id",
          },
          onUpdate: "CASCADE",
          onDelete: "SET NULL",
        },
        email: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        otp: {
          type: Sequelize.STRING,
          allowNull: false,
        },
        expires_at: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        created_at: {
          allowNull: false,
          type: Sequelize.DATE,
        },
        updated_at: {
          allowNull: false,
          type: Sequelize.DATE,
        },
      });
    }

    const columns = await queryInterface.describeTable("email_otps");

    // Postgres-safe and repeatable index creation.
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS "email_otps_email" ON "email_otps" ("email");',
    );

    if (columns.expires_at) {
      await queryInterface.sequelize.query(
        'CREATE INDEX IF NOT EXISTS "email_otps_expires_at" ON "email_otps" ("expires_at");',
      );
    } else if (columns.expiresAt) {
      await queryInterface.sequelize.query(
        'CREATE INDEX IF NOT EXISTS "email_otps_expiresAt" ON "email_otps" ("expiresAt");',
      );
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("email_otps");
  },
};
