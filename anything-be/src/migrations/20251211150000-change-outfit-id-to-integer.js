"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop calendar_entries table first (has foreign key to outfits)
    await queryInterface.dropTable("calendar_entries");

    // Drop outfits table
    await queryInterface.dropTable("outfits");

    // Recreate outfits table with INTEGER id
    await queryInterface.createTable("outfits", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: "user_id",
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      topId: {
        type: Sequelize.INTEGER,
        field: "top_id",
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      bottomId: {
        type: Sequelize.INTEGER,
        field: "bottom_id",
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      shoeId: {
        type: Sequelize.INTEGER,
        field: "shoe_id",
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      primaryImageUrl: {
        type: Sequelize.TEXT,
        field: "primary_image_url",
      },
      imageList: {
        type: Sequelize.JSON,
        field: "image_list",
      },
      poseLeft: {
        type: Sequelize.TEXT,
        field: "pose_left",
      },
      poseRight: {
        type: Sequelize.TEXT,
        field: "pose_right",
      },
      rating: { type: Sequelize.FLOAT },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: "created_at",
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: "updated_at",
      },
    });

    // Drop enum type for calendar_entries
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_calendar_entries_occasion;"
    );

    // Recreate calendar_entries table with INTEGER outfit foreign key
    await queryInterface.createTable("calendar_entries", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: "user_id",
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      outfitId: {
        type: Sequelize.INTEGER,
        field: "outfit_id",
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
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: "created_at",
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: "updated_at",
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

    // Recreate with UUID (original structure)
    await queryInterface.createTable("outfits", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: "user_id",
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      topId: {
        type: Sequelize.INTEGER,
        field: "top_id",
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      bottomId: {
        type: Sequelize.INTEGER,
        field: "bottom_id",
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      shoeId: {
        type: Sequelize.INTEGER,
        field: "shoe_id",
        references: { model: "apparels", key: "id" },
        onDelete: "SET NULL",
      },
      primaryImageUrl: {
        type: Sequelize.TEXT,
        field: "primary_image_url",
      },
      imageList: {
        type: Sequelize.JSON,
        field: "image_list",
      },
      poseLeft: {
        type: Sequelize.TEXT,
        field: "pose_left",
      },
      poseRight: {
        type: Sequelize.TEXT,
        field: "pose_right",
      },
      rating: { type: Sequelize.FLOAT },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: "created_at",
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: "updated_at",
      },
    });

    await queryInterface.createTable("calendar_entries", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        field: "user_id",
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      outfitId: {
        type: Sequelize.UUID,
        field: "outfit_id",
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
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: "created_at",
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        field: "updated_at",
      },
    });
  },
};
