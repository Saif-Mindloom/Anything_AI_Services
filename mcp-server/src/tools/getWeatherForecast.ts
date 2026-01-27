import { z } from "zod";
import { WeatherService } from "../services/weatherService.js";

/**
 * Schema for getWeatherForecast tool
 */
export const GetWeatherForecastSchema = z.object({
  location: z
    .string()
    .optional()
    .describe(
      "Location for weather forecast (e.g., 'Mumbai, India', 'Delhi'). Defaults to 'Mumbai, India'"
    ),
  days: z
    .number()
    .min(1)
    .max(7)
    .optional()
    .describe(
      "Number of days for forecast (1-7). Defaults to 7 for weekly forecast"
    ),
  specificDay: z
    .enum(["today", "tomorrow"])
    .optional()
    .describe("Get weather for a specific day: 'today' or 'tomorrow'"),
});

export type GetWeatherForecastInput = z.infer<typeof GetWeatherForecastSchema>;

/**
 * Get weather forecast for current week
 * Provides temperature, conditions, and weather information
 */
export async function getWeatherForecast(
  input: GetWeatherForecastInput
): Promise<string> {
  try {
    const location = input.location || "Mumbai, India";
    const days = input.days || 7;

    console.log(`Fetching ${days}-day weather forecast for ${location}`);

    const weatherService = new WeatherService();
    const forecasts = await weatherService.getWeeklyForecast(location);

    if (forecasts.length === 0) {
      return `No weather forecast available for ${location}`;
    }

    // Handle specific day requests
    if (input.specificDay === "today") {
      const todayForecast = forecasts[0];
      let response = `Weather for TODAY in ${location}:\n\n`;
      response += `${todayForecast.dayOfWeek} (${todayForecast.date})\n`;
      response += `Condition: ${todayForecast.condition} - ${todayForecast.description}\n`;
      response += `Temperature: ${todayForecast.temperature.min}${todayForecast.temperature.unit} to ${todayForecast.temperature.max}${todayForecast.temperature.unit}\n`;
      if (todayForecast.humidity) {
        response += `Precipitation probability: ${todayForecast.humidity}%\n`;
      }
      response += `\n💡 Use this weather information to suggest appropriate clothing for today's conditions.`;
      return response;
    }

    if (input.specificDay === "tomorrow") {
      if (forecasts.length < 2) {
        return `Tomorrow's weather forecast not available for ${location}`;
      }
      const tomorrowForecast = forecasts[1];
      let response = `Weather for TOMORROW in ${location}:\n\n`;
      response += `${tomorrowForecast.dayOfWeek} (${tomorrowForecast.date})\n`;
      response += `Condition: ${tomorrowForecast.condition} - ${tomorrowForecast.description}\n`;
      response += `Temperature: ${tomorrowForecast.temperature.min}${tomorrowForecast.temperature.unit} to ${tomorrowForecast.temperature.max}${tomorrowForecast.temperature.unit}\n`;
      if (tomorrowForecast.humidity) {
        response += `Precipitation probability: ${tomorrowForecast.humidity}%\n`;
      }
      response += `\n💡 Use this weather information to suggest appropriate clothing for tomorrow's conditions.`;
      return response;
    }

    // Limit to requested number of days
    const limitedForecasts = forecasts.slice(0, days);

    // Format the response
    let response = `Weather Forecast for ${location} (${days} days):\n\n`;
    response += weatherService.formatForecast(limitedForecasts);
    response += `\n\nNote: Use this weather information to help users choose appropriate outfits. Consider temperature ranges, rain probability, and conditions when making outfit suggestions.`;

    return response;
  } catch (error) {
    console.error("Error in getWeatherForecast:", error);
    return `Failed to fetch weather forecast: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
  }
}
