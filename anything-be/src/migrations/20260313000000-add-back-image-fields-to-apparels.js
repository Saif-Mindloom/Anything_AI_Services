"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn("apparels", "url_raw_back", {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "Raw uploaded back-view image URL for apparel",
    });

    await queryInterface.addColumn("apparels", "url_processed_back", {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "Processed isolated back-view image URL for apparel",
    });

    await queryInterface.addColumn("apparels", "gs_util_raw_back", {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "GCS URI for raw uploaded back-view image",
    });

    await queryInterface.addColumn("apparels", "gs_util_processed_back", {
      type: Sequelize.TEXT,
      allowNull: true,
      comment: "GCS URI for processed back-view image",
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("apparels", "gs_util_processed_back");
    await queryInterface.removeColumn("apparels", "gs_util_raw_back");
    await queryInterface.removeColumn("apparels", "url_processed_back");
    await queryInterface.removeColumn("apparels", "url_raw_back");
  },
};
