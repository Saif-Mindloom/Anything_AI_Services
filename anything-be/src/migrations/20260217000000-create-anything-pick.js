"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("anything_picks", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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
      selected_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      weather: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: "Temperature in Fahrenheit or Celsius",
      },
      occasion: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "LLM-generated reason for outfit selection",
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

    // Add indexes for performance
    await queryInterface.addIndex(
      "anything_picks",
      ["user_id", "selected_date"],
      {
        name: "idx_anything_picks_user_date",
        unique: true,
      },
    );

    await queryInterface.addIndex("anything_picks", ["user_id", "outfit_id"], {
      name: "idx_anything_picks_user_outfit",
    });

    // Create table to track used outfits
    await queryInterface.createTable("used_anything_picks", {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
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

    // Add unique constraint to prevent duplicate entries
    await queryInterface.addIndex(
      "used_anything_picks",
      ["user_id", "outfit_id"],
      {
        name: "idx_used_anything_picks_unique",
        unique: true,
      },
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("used_anything_picks");
    await queryInterface.dropTable("anything_picks");
  },
};
