"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("outfits");

    // Drop foreign key constraints first
    await queryInterface.sequelize.query(
      'ALTER TABLE "outfits" DROP CONSTRAINT IF EXISTS "outfits_top_id_fkey";'
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "outfits" DROP CONSTRAINT IF EXISTS "outfits_bottom_id_fkey";'
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "outfits" DROP CONSTRAINT IF EXISTS "outfits_shoe_id_fkey";'
    );
    await queryInterface.sequelize.query(
      'ALTER TABLE "outfits" DROP CONSTRAINT IF EXISTS "outfits_dress_id_fkey";'
    );

    // Update existing null values to 0
    await queryInterface.sequelize.query(
      `UPDATE outfits SET top_id = 0 WHERE top_id IS NULL`
    );
    await queryInterface.sequelize.query(
      `UPDATE outfits SET bottom_id = 0 WHERE bottom_id IS NULL`
    );
    await queryInterface.sequelize.query(
      `UPDATE outfits SET shoe_id = 0 WHERE shoe_id IS NULL`
    );
    if (columns.dress_id) {
      await queryInterface.sequelize.query(
        `UPDATE outfits SET dress_id = 0 WHERE dress_id IS NULL`
      );
    }

    // Change columns to NOT NULL with default 0
    await queryInterface.changeColumn("outfits", "top_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.changeColumn("outfits", "bottom_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    await queryInterface.changeColumn("outfits", "shoe_id", {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });

    if (columns.dress_id) {
      await queryInterface.changeColumn("outfits", "dress_id", {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Revert to nullable columns
    await queryInterface.changeColumn("outfits", "top_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.changeColumn("outfits", "bottom_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.changeColumn("outfits", "shoe_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    await queryInterface.changeColumn("outfits", "dress_id", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Re-add foreign key constraints
    await queryInterface.addConstraint("outfits", {
      fields: ["top_id"],
      type: "foreign key",
      name: "outfits_top_id_fkey",
      references: {
        table: "apparels",
        field: "id",
      },
      onDelete: "SET NULL",
    });

    await queryInterface.addConstraint("outfits", {
      fields: ["bottom_id"],
      type: "foreign key",
      name: "outfits_bottom_id_fkey",
      references: {
        table: "apparels",
        field: "id",
      },
      onDelete: "SET NULL",
    });

    await queryInterface.addConstraint("outfits", {
      fields: ["shoe_id"],
      type: "foreign key",
      name: "outfits_shoe_id_fkey",
      references: {
        table: "apparels",
        field: "id",
      },
      onDelete: "SET NULL",
    });

    await queryInterface.addConstraint("outfits", {
      fields: ["dress_id"],
      type: "foreign key",
      name: "outfits_dress_id_fkey",
      references: {
        table: "apparels",
        field: "id",
      },
      onDelete: "SET NULL",
    });
  },
};
