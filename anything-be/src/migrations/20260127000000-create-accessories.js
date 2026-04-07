"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    let accessoriesExists = true;
    try {
      await queryInterface.describeTable("accessories");
    } catch (error) {
      accessoriesExists = false;
    }

    if (!accessoriesExists) {
      await queryInterface.createTable("accessories", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      outfit_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "outfits",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      accessory_type: {
        type: Sequelize.ENUM(
          "headwear",
          "eyewear",
          "necklace",
          "chain",
          "scarf",
          "ring",
          "bracelet",
          "watch",
          "belt",
          "bag",
        ),
        allowNull: false,
      },
      description: {
        type: Sequelize.TEXT,
      },
      image_url: {
        type: Sequelize.TEXT,
      },
      gs_util: {
        type: Sequelize.TEXT,
      },
      status: {
        type: Sequelize.ENUM("pending", "complete", "failed"),
        allowNull: false,
        defaultValue: "pending",
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal("CURRENT_TIMESTAMP"),
      },
      });
    }

    // Add indexes for better query performance
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS "accessories_outfit_id_idx" ON "accessories" ("outfit_id");'
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS "accessories_accessory_type_idx" ON "accessories" ("accessory_type");'
    );
    await queryInterface.sequelize.query(
      'CREATE INDEX IF NOT EXISTS "accessories_status_idx" ON "accessories" ("status");'
    );
  },

  async down(queryInterface, Sequelize) {
    // Remove indexes first
    await queryInterface.removeIndex(
      "accessories",
      "accessories_outfit_id_idx",
    );
    await queryInterface.removeIndex(
      "accessories",
      "accessories_accessory_type_idx",
    );
    await queryInterface.removeIndex("accessories", "accessories_status_idx");

    // Drop table
    await queryInterface.dropTable("accessories");

    // Drop ENUM types
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_accessories_accessory_type";',
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_accessories_status";',
    );
  },
};
