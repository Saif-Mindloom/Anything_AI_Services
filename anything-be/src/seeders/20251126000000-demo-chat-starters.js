"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.bulkInsert("chat_starters", [
      {
        id: Sequelize.literal("gen_random_uuid()"),
        message: "What's trending in fashion today?",
        category: "fashion",
        sort_order: 1,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        message: "Can you help me style my outfit?",
        category: "styling",
        sort_order: 2,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        message: "Show me virtual try-on options",
        category: "try-on",
        sort_order: 3,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        message: "What colors work best for my skin tone?",
        category: "color-matching",
        sort_order: 4,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        message: "Generate a new model pose",
        category: "model",
        sort_order: 5,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("chat_starters", null, {});
  },
};
