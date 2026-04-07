"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable("calendar_entries");

    // If weather is already an integer and temp column is absent, migration has effectively been applied.
    if (columns.weather && columns.weather.type && String(columns.weather.type).includes("INTEGER") && !columns.weather_temp) {
      console.log("Weather column is already integer; skipping migration");
      return;
    }

    // Step 1: Add a temporary column with integer type (idempotent for partial runs)
    if (!columns.weather_temp) {
      await queryInterface.addColumn("calendar_entries", "weather_temp", {
        type: Sequelize.INTEGER,
        allowNull: true,
      });
    }

    // Step 2: Set default temperature values for existing string weather data
    await queryInterface.sequelize.query(`
      UPDATE calendar_entries 
      SET weather_temp = CASE 
        WHEN LOWER(weather::text) = 'sunny' OR LOWER(weather::text) = 'clear' THEN 25
        WHEN LOWER(weather::text) = 'cloudy' THEN 20
        WHEN LOWER(weather::text) = 'rainy' THEN 15
        WHEN LOWER(weather::text) = 'windy' THEN 18
        WHEN LOWER(weather::text) = 'snowy' THEN 0
        WHEN LOWER(weather::text) = 'hot' THEN 35
        WHEN LOWER(weather::text) = 'cold' THEN 5
        WHEN weather::text ~ '^-?\\d+$' THEN CAST(weather::text AS INTEGER)
        ELSE 22
      END
      WHERE weather IS NOT NULL;
    `);

    // Step 3: Drop the old weather column
    await queryInterface.removeColumn("calendar_entries", "weather");

    // Step 4: Rename the temporary column to weather
    await queryInterface.renameColumn(
      "calendar_entries",
      "weather_temp",
      "weather"
    );

    console.log(
      "Updated weather column from string to integer (temperature in Celsius)"
    );
  },

  async down(queryInterface, Sequelize) {
    // Rollback: change back to string
    await queryInterface.changeColumn("calendar_entries", "weather", {
      type: Sequelize.STRING,
      allowNull: true,
    });

    console.log("Reverted weather column back to string");
  },
};
