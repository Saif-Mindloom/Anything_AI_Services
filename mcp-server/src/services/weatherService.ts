import axios from "axios";
import { config } from "../config.js";

interface WeatherForecast {
  date: string;
  dayOfWeek: string;
  temperature: {
    min: number;
    max: number;
    unit: string;
  };
  condition: string;
  description: string;
  humidity?: number;
  windSpeed?: number;
}

interface GoogleMapsWeatherResponse {
  daily?: {
    time?: string[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    weather_code?: number[];
    precipitation_probability_max?: number[];
  };
}

/**
 * Weather Service using Google Maps Weather API
 * Provides 7-day weather forecast
 */
export class WeatherService {
  private apiKey: string;
  private geocodingApiUrl = "https://maps.googleapis.com/maps/api/geocode/json";

  // Weather code mappings (based on WMO codes)
  private weatherCodeMap: {
    [key: number]: { condition: string; description: string };
  } = {
    0: { condition: "Clear", description: "Clear sky" },
    1: { condition: "Mainly Clear", description: "Mainly clear" },
    2: { condition: "Partly Cloudy", description: "Partly cloudy" },
    3: { condition: "Overcast", description: "Overcast" },
    45: { condition: "Foggy", description: "Foggy" },
    48: { condition: "Foggy", description: "Depositing rime fog" },
    51: { condition: "Drizzle", description: "Light drizzle" },
    53: { condition: "Drizzle", description: "Moderate drizzle" },
    55: { condition: "Drizzle", description: "Dense drizzle" },
    61: { condition: "Rain", description: "Slight rain" },
    63: { condition: "Rain", description: "Moderate rain" },
    65: { condition: "Rain", description: "Heavy rain" },
    71: { condition: "Snow", description: "Slight snow fall" },
    73: { condition: "Snow", description: "Moderate snow fall" },
    75: { condition: "Snow", description: "Heavy snow fall" },
    77: { condition: "Snow", description: "Snow grains" },
    80: { condition: "Rain Showers", description: "Slight rain showers" },
    81: { condition: "Rain Showers", description: "Moderate rain showers" },
    82: { condition: "Rain Showers", description: "Violent rain showers" },
    85: { condition: "Snow Showers", description: "Slight snow showers" },
    86: { condition: "Snow Showers", description: "Heavy snow showers" },
    95: { condition: "Thunderstorm", description: "Thunderstorm" },
    96: {
      condition: "Thunderstorm",
      description: "Thunderstorm with slight hail",
    },
    99: {
      condition: "Thunderstorm",
      description: "Thunderstorm with heavy hail",
    },
  };

  constructor() {
    this.apiKey = config.googleMapsApiKey;
  }

  /**
   * Get coordinates from location name using Google Maps Geocoding API
   */
  private async getCoordinates(
    location: string
  ): Promise<{ lat: number; lng: number } | null> {
    try {
      const response = await axios.get(this.geocodingApiUrl, {
        params: {
          address: location,
          key: this.apiKey,
        },
      });

      if (response.data.status === "OK" && response.data.results.length > 0) {
        const { lat, lng } = response.data.results[0].geometry.location;
        return { lat, lng };
      }

      console.error(`Geocoding failed for location: ${location}`);
      return null;
    } catch (error) {
      console.error("Error fetching coordinates:", error);
      return null;
    }
  }

  /**
   * Get 7-day weather forecast for a location
   * Using Open-Meteo API (free) since Google Maps Weather API is not publicly available yet
   */
  async getWeeklyForecast(
    location: string = "Mumbai, India"
  ): Promise<WeatherForecast[]> {
    try {
      // Get coordinates for the location
      const coords = await this.getCoordinates(location);
      if (!coords) {
        throw new Error(`Could not find coordinates for location: ${location}`);
      }

      // Use Open-Meteo API for weather data (free alternative)
      const weatherApiUrl = "https://api.open-meteo.com/v1/forecast";
      const response = await axios.get(weatherApiUrl, {
        params: {
          latitude: coords.lat,
          longitude: coords.lng,
          daily:
            "temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max",
          timezone: "Asia/Kolkata",
          forecast_days: 7,
        },
      });

      const dailyData = response.data.daily;
      const forecasts: WeatherForecast[] = [];

      for (let i = 0; i < dailyData.time.length; i++) {
        const date = new Date(dailyData.time[i]);
        const weatherCode = dailyData.weather_code[i];
        const weatherInfo = this.weatherCodeMap[weatherCode] || {
          condition: "Unknown",
          description: "Weather information unavailable",
        };

        forecasts.push({
          date: dailyData.time[i],
          dayOfWeek: date.toLocaleDateString("en-US", { weekday: "long" }),
          temperature: {
            min: Math.round(dailyData.temperature_2m_min[i]),
            max: Math.round(dailyData.temperature_2m_max[i]),
            unit: "°C",
          },
          condition: weatherInfo.condition,
          description: weatherInfo.description,
          humidity: dailyData.precipitation_probability_max?.[i],
        });
      }

      return forecasts;
    } catch (error) {
      console.error("Error fetching weather forecast:", error);
      throw new Error(
        `Failed to fetch weather forecast: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Get today's weather
   */
  async getTodayWeather(
    location: string = "Mumbai, India"
  ): Promise<WeatherForecast | null> {
    try {
      const forecasts = await this.getWeeklyForecast(location);
      return forecasts.length > 0 ? forecasts[0] : null;
    } catch (error) {
      console.error("Error fetching today's weather:", error);
      return null;
    }
  }

  /**
   * Format weather forecast as a readable string
   */
  formatForecast(forecasts: WeatherForecast[]): string {
    return forecasts
      .map(
        (forecast) =>
          `${forecast.dayOfWeek} (${forecast.date}): ${forecast.condition} - ${forecast.description}. ` +
          `Temperature: ${forecast.temperature.min}${forecast.temperature.unit} to ${forecast.temperature.max}${forecast.temperature.unit}` +
          (forecast.humidity ? `, Precipitation: ${forecast.humidity}%` : "")
      )
      .join("\n");
  }
}
