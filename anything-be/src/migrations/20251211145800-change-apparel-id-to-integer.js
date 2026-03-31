"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Drop outfits table first (has foreign key to apparels)
    await queryInterface.dropTable("outfits");

    // Drop apparels table
    await queryInterface.dropTable("apparels");

    // Drop enum types
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_apparels_category;"
    );
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_apparels_subcategory;"
    );
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_apparels_status;"
    );
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_apparels_material;"
    );

    // Recreate apparels table with INTEGER id
    await queryInterface.createTable("apparels", {
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
      category: {
        type: Sequelize.ENUM("top", "bottom", "shoe", "accessory", "outerwear"),
        allowNull: false,
      },
      subcategory: {
        type: Sequelize.ENUM(
          "tshirt",
          "shirt",
          "jeans",
          "shorts",
          "sneakers",
          "heels",
          "jacket",
          "coat",
          "other"
        ),
        allowNull: false,
      },
      brand: { type: Sequelize.STRING },
      name: { type: Sequelize.STRING },
      status: {
        type: Sequelize.ENUM("pending", "complete", "deleted"),
        allowNull: false,
      },
      description: { type: Sequelize.STRING },
      material: {
        type: Sequelize.ENUM(
          "Cotton",
          "Linen",
          "Denim",
          "Polyester",
          "Nylon",
          "Silk",
          "Wool",
          "Rayon"
        ),
        allowNull: false,
      },
      colors: { type: Sequelize.JSON },
      favorite: { type: Sequelize.BOOLEAN, defaultValue: false },
      urlRaw: {
        type: Sequelize.TEXT,
        field: "url_raw",
      },
      urlProcessed: {
        type: Sequelize.TEXT,
        field: "url_processed",
      },
      gsUtilRaw: {
        type: Sequelize.TEXT,
        field: "gs_util_raw",
      },
      gsUtilProcessed: {
        type: Sequelize.TEXT,
        field: "gs_util_processed",
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

    // Recreate outfits table with INTEGER foreign keys
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
  },

  async down(queryInterface, Sequelize) {
    // Drop tables
    await queryInterface.dropTable("outfits");
    await queryInterface.dropTable("apparels");

    // Drop enum types
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_apparels_category;"
    );
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_apparels_subcategory;"
    );
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_apparels_status;"
    );
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_apparels_material;"
    );

    // Recreate with UUID (original structure)
    await queryInterface.createTable("apparels", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      category: {
        type: Sequelize.ENUM("top", "bottom", "shoe", "accessory", "outerwear"),
        allowNull: false,
      },
      subcategory: {
        type: Sequelize.ENUM(
          "tshirt",
          "shirt",
          "jeans",
          "shorts",
          "sneakers",
          "heels",
          "jacket",
          "coat",
          "other"
        ),
        allowNull: false,
      },
      brand: { type: Sequelize.STRING },
      name: { type: Sequelize.STRING },
      status: {
        type: Sequelize.ENUM("pending", "complete", "deleted"),
        allowNull: false,
      },
      description: { type: Sequelize.STRING },
      material: {
        type: Sequelize.ENUM(
          "Cotton",
          "Linen",
          "Denim",
          "Polyester",
          "Nylon",
          "Silk",
          "Wool",
          "Rayon"
        ),
        allowNull: false,
      },
      colors: { type: Sequelize.JSON },
      favorite: { type: Sequelize.BOOLEAN, defaultValue: false },
      urlRaw: { type: Sequelize.TEXT },
      urlProcessed: { type: Sequelize.TEXT },
      gsUtilRaw: { type: Sequelize.TEXT },
      gsUtilProcessed: { type: Sequelize.TEXT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable("outfits", {
      id: {
        type: Sequelize.UUID,
        primaryKey: true,
        defaultValue: Sequelize.literal("gen_random_uuid()"),
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onDelete: "CASCADE",
      },
      topId: {
        type: Sequelize.UUID,
        references: { model: "apparels", key: "id" },
      },
      bottomId: {
        type: Sequelize.UUID,
        references: { model: "apparels", key: "id" },
      },
      shoeId: {
        type: Sequelize.UUID,
        references: { model: "apparels", key: "id" },
      },
      primaryImageUrl: { type: Sequelize.TEXT },
      imageList: { type: Sequelize.JSON },
      poseLeft: { type: Sequelize.TEXT },
      poseRight: { type: Sequelize.TEXT },
      rating: { type: Sequelize.FLOAT },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },
};
