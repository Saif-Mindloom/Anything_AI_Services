"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
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
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("apparels");
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
  },
};
