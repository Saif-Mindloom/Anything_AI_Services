"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // First, let's get the first user ID and outfit IDs to link our calendar entries
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

    const outfits = await queryInterface.sequelize.query(
      "SELECT id FROM outfits WHERE user_id = ? ORDER BY created_at LIMIT 3",
      {
        replacements: [userId],
        type: Sequelize.QueryTypes.SELECT,
      }
    );

    if (outfits.length === 0) {
      console.log(
        "No outfits found. Please run the demo-outfits seeder first."
      );
      return;
    }

    console.log(
      `Creating demo calendar entries for user ID: ${userId} with ${outfits.length} outfits`
    );

    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(today.getDate() + 2);

    await queryInterface.bulkInsert("calendar_entries", [
      {
        id: Sequelize.literal("gen_random_uuid()"),
        user_id: userId,
        outfit_id: outfits[0]?.id,
        date: today.toISOString().split("T")[0], // YYYY-MM-DD format
        time: "09:00:00",
        occasion: "work",
        weather: 25, // 25°C
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        user_id: userId,
        outfit_id: outfits[1]?.id,
        date: tomorrow.toISOString().split("T")[0], // YYYY-MM-DD format
        time: "19:30:00",
        occasion: "party",
        weather: 20, // 20°C
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        user_id: userId,
        outfit_id: outfits[2]?.id,
        date: dayAfterTomorrow.toISOString().split("T")[0], // YYYY-MM-DD format
        time: "14:00:00",
        occasion: "casual",
        weather: 15, // 15°C
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        user_id: userId,
        outfit_id: outfits[0]?.id,
        date: "2024-12-01",
        time: "08:30:00",
        occasion: "formal",
        weather: 22, // 22°C
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: Sequelize.literal("gen_random_uuid()"),
        user_id: userId,
        outfit_id: outfits[1]?.id,
        date: "2024-12-15",
        time: "18:00:00",
        occasion: "travel",
        weather: 18, // 18°C
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    console.log("Demo calendar entries created successfully!");
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete("calendar_entries", null, {});
  },
};
