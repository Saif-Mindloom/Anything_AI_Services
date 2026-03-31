"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop calendar_entries table first (has foreign key to outfits)
    await queryInterface.dropTable("calendar_entries");

    // Drop outfits table
    await queryInterface.dropTable("outfits");

    // Recreate outfits table with INTEGER id (no autoIncrement for custom IDs)
    await queryInterface.createTable("outfits", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        allowNull: false,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      top_id: {
        type: Sequelize.INTEGER,
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      bottom_id: {
        type: Sequelize.INTEGER,
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      shoe_id: {
        type: Sequelize.INTEGER,
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      dress_id: {
        type: Sequelize.INTEGER,
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      primary_image_url: {
        type: Sequelize.TEXT,
      },
      gs_util: {
        type: Sequelize.TEXT,
      },
      image_list: {
        type: Sequelize.JSON,
      },
      pose_left: {
        type: Sequelize.TEXT,
      },
      pose_right: {
        type: Sequelize.TEXT,
      },
      rating: { type: Sequelize.FLOAT },
      visible: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    // Drop enum type for calendar_entries if it exists
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_calendar_entries_occasion;"
    );

    // Recreate calendar_entries table with STRING outfit foreign key
    await queryInterface.createTable("calendar_entries", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      outfit_id: {
        type: Sequelize.INTEGER,
        references: { model: "outfits", key: "id" },
        onDelete: "SET NULL",
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      time: { type: Sequelize.TIME, allowNull: false },
      weather: { type: Sequelize.INTEGER },
      occasion: {
        type: Sequelize.ENUM(
          "casual",
          "formal",
          "party",
          "sport",
          "travel",
          "work",
          "other"
        ),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },

  async down(queryInterface, Sequelize) {
    // Drop tables
    await queryInterface.dropTable("calendar_entries");
    await queryInterface.dropTable("outfits");

    // Drop enum type
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_calendar_entries_occasion;"
    );

    // Recreate with INTEGER id (previous structure)
    await queryInterface.createTable("outfits", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      top_id: {
        type: Sequelize.INTEGER,
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      bottom_id: {
        type: Sequelize.INTEGER,
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      shoe_id: {
        type: Sequelize.INTEGER,
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      dress_id: {
        type: Sequelize.INTEGER,
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      primary_image_url: {
        type: Sequelize.TEXT,
      },
      gs_util: {
        type: Sequelize.TEXT,
      },
      image_list: {
        type: Sequelize.JSON,
      },
      pose_left: {
        type: Sequelize.TEXT,
      },
      pose_right: {
        type: Sequelize.TEXT,
      },
      rating: { type: Sequelize.FLOAT },
      visible: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.createTable("calendar_entries", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      outfit_id: {
        type: Sequelize.INTEGER,
        references: { model: "outfits", key: "id" },
        onDelete: "SET NULL",
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      time: { type: Sequelize.TIME, allowNull: false },
      weather: { type: Sequelize.INTEGER },
      occasion: {
        type: Sequelize.ENUM(
          "casual",
          "formal",
          "party",
          "sport",
          "travel",
          "work",
          "other"
        ),
        allowNull: false,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },
};
