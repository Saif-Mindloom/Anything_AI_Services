"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("apparels");
    if (!columns.original_uploaded_image_url) {
      await queryInterface.addColumn("apparels", "original_uploaded_image_url", {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: "URL of the original image that was uploaded before processing",
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("apparels");
    if (columns.original_uploaded_image_url) {
      await queryInterface.removeColumn(
        "apparels",
        "original_uploaded_image_url"
      );
    }
  },
};
