"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("apparels", "original_uploaded_image_url", {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "URL of the original image that was uploaded before processing",
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.removeColumn(
      "apparels",
      "original_uploaded_image_url"
    );
  },
};
