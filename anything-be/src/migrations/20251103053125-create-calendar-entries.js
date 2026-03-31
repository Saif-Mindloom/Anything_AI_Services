"use strict";
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable("calendar_entries", {
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
      outfitId: {
        type: Sequelize.UUID,
        references: { model: "outfits", key: "id" },
        onDelete: "SET NULL",
      },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      time: { type: Sequelize.TIME, allowNull: false },
      weather: { type: Sequelize.STRING },
      occasion: {
        type: Sequelize.ENUM(
          "casual",
          "formal",
          "party",
          "sport",
          "travel",
          "work",
          "other"
        ),
        allowNull: false,
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },
  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable("calendar_entries");
    await queryInterface.sequelize.query(
      "DROP TYPE IF EXISTS enum_calendar_entries_occasion;"
    );
  },
};
