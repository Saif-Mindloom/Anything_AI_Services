"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // First, let's get the first user ID to link our outfits to
    const users = await queryInterface.sequelize.query(
      "SELECT id FROM users ORDER BY id LIMIT 1",
      { type: Sequelize.QueryTypes.SELECT }
    );

    if (users.length === 0) {
      console.log(
        "No users found. Please create a user first before running this seeder."
      );
      return;
    }

    const userId = users[0].id;
    console.log(`Creating demo outfits for user ID: ${userId}`);

    await queryInterface.bulkInsert("outfits", [
      {
        id: Sequelize.literal("gen_random_uuid()"),
        user_id: userId,
        primary_image_url: "https://example.com/outfit1.jpg",
        image_list: JSON.stringify([
          "https://example.com/outfit1-front.jpg",
          "https://example.com/outfit1-back.jpg",
        ]),
        pose_left: "https://example.com/outfit1-left.jpg",
        pose_right: "https://example.com/outfit1-right.jpg",
        rating: 4.5,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        user_id: userId,
        primary_image_url: "https://example.com/outfit2.jpg",
        image_list: JSON.stringify([
          "https://example.com/outfit2-front.jpg",
          "https://example.com/outfit2-back.jpg",
        ]),
        pose_left: "https://example.com/outfit2-left.jpg",
        pose_right: "https://example.com/outfit2-right.jpg",
        rating: 4.2,
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        user_id: userId,
        primary_image_url: "https://example.com/outfit3.jpg",
        image_list: JSON.stringify([
          "https://example.com/outfit3-front.jpg",
          "https://example.com/outfit3-back.jpg",
        ]),
        pose_left: "https://example.com/outfit3-left.jpg",
        pose_right: "https://example.com/outfit3-right.jpg",
        rating: 4.8,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    console.log("Demo outfits created successfully!");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("outfits", null, {});
  },
};
