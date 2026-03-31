"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("app_documents", [
      {
        id: Sequelize.literal("gen_random_uuid()"),
        type: "termsAndConditions",
        url: "https://example.com/terms-and-conditions",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        type: "privacyPolicy",
        url: "https://example.com/privacy-policy",
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("app_documents", null, {});
  },
};
