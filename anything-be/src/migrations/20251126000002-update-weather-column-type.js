"use strict";

module.exports = {
  async up(queryInterface, Sequelize) {
    // Step 1: Add a temporary column with integer type
    await queryInterface.addColumn("calendar_entries", "weather_temp", {
      type: Sequelize.INTEGER,
      allowNull: true,
    });

    // Step 2: Set default temperature values for existing string weather data
    await queryInterface.sequelize.query(`
      UPDATE calendar_entries 
      SET weather_temp = CASE 
        WHEN weather = 'sunny' OR weather = 'clear' THEN 25
        WHEN weather = 'cloudy' THEN 20
        WHEN weather = 'rainy' THEN 15
        WHEN weather = 'windy' THEN 18
        WHEN weather = 'snowy' THEN 0
        WHEN weather = 'hot' THEN 35
        WHEN weather = 'cold' THEN 5
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
