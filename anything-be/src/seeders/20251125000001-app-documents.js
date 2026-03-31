"use strict";
const { v4: uuidv4 } = require("uuid");

module.exports = {
  async up(queryInterface, Sequelize) {
    const appDocuments = [
      {
        id: uuidv4(),
        type: "termsAndConditions",
        url: "https://cdn.yourapp.com/docs/terms-v1.html",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: uuidv4(),
        type: "privacyPolicy",
        url: "https://cdn.yourapp.com/docs/privacy-v1.html",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await queryInterface.bulkInsert("app_documents", appDocuments, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("app_documents", null, {});
  },
};
