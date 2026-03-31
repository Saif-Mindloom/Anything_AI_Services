"use strict";
const { v4: uuidv4 } = require("uuid");

module.exports = {
  async up(queryInterface, Sequelize) {
    const chatStarters = [
      {
        id: uuidv4(),
        message: "Help me build an outfit for tomorrow",
        category: "styling",
        sortOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: uuidv4(),
        message: "Suggest a look based on my wardrobe",
        category: "styling",
        sortOrder: 2,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: uuidv4(),
        message: "What colors suit me best?",
        category: "style",
        sortOrder: 3,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: uuidv4(),
        message: "Can you style something casual today?",
        category: "occasions",
        sortOrder: 4,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: uuidv4(),
        message: "Recommend shoes for my favorite jeans",
        category: "styling",
        sortOrder: 5,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    await queryInterface.bulkInsert("chat_starters", chatStarters, {});
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("chat_starters", null, {});
  },
};
