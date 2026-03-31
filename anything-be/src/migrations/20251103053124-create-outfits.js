"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
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
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("outfits");
  },
};
