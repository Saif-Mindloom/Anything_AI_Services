import { CalendarEntry, Outfit } from "../models/index";
import { authenticateUser } from "../services/helper/auth";
import { generateOutfitAnglesMutation } from "../services/outfitService";
import { WeatherService } from "../services/weatherService";

const calendarResolvers = {
  Query: {
    getWeatherForecast: async (
      _: any,
      { latitude, longitude }: { latitude: number; longitude: number },
      context: any,
    ) => {
      try {
        const auth = await authenticateUser(context);

        if (auth.error) {
          return {
            weatherData: [],
            status: "Unable to authenticate user",
          };
        }

        // Validate required parameters
        if (latitude === undefined || longitude === undefined) {
          return {
            weatherData: [],
            status:
              "Missing required parameters: latitude and longitude are required",
          };
        }

        console.log(
          `🌤️ Fetching 7-day weather forecast for coordinates (${latitude}, ${longitude})...`,
        );

        const weatherService = new WeatherService();
        const weatherForecasts = await weatherService.getWeeklyForecastByCoords(
          latitude,
          longitude,
        );

        // Transform weather data to match GraphQL schema
        const weatherData = weatherForecasts.map((forecast) => ({
          date: forecast.date,
          dayOfWeek: forecast.dayOfWeek,
          temperatureMin: forecast.temperature.min,
          temperatureMax: forecast.temperature.max,
          temperatureUnit: forecast.temperature.unit,
          condition: forecast.condition,
          description: forecast.description,
          precipitation: forecast.precipitation || 0,
        }));

        console.log(
          `✅ Successfully fetched weather for ${weatherData.length} days`,
        );

        return {
          weatherData,
          status: `Successfully retrieved ${weatherData.length} days of weather forecast`,
        };
      } catch (error) {
        console.error("Error in getWeatherForecast:", error);
        return {
          weatherData: [],
          status: `Error fetching weather forecast: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        };
      }
    },

    getUserCalendar: async (
      _: any,
      { dateFilter }: { dateFilter?: string },
      context: any,
    ) => {
      try {
        const auth = await authenticateUser(context);

        if (auth.error)
          return { calendarItems: [], status: "unable to authenticate user" };
        const userId = auth.user.userId;

        console.log(
          `Fetching calendar for user: ${userId}${
            dateFilter ? ` with filter: ${dateFilter}` : ""
          }`,
        );

        // Build where clause
        let whereClause: any = {
          userId: userId,
        };

        // Apply date filter if provided
        if (dateFilter) {
          const { Op } = await import("sequelize");

          // Check if it's a date range format (YYYY-MM-DD/YYYY-MM-DD)
          if (dateFilter.includes("/")) {
            const dateParts = dateFilter.split("/");

            if (dateParts.length !== 2) {
              return {
                calendarItems: [],
                status:
                  "Invalid date range format. Please use YYYY-MM-DD/YYYY-MM-DD format (e.g., '2025-12-01/2026-01-04')",
              };
            }

            const [startDateStr, endDateStr] = dateParts;

            // Validate both dates are in YYYY-MM-DD format
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(startDateStr) ||
              !/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)
            ) {
              return {
                calendarItems: [],
                status:
                  "Invalid date format in range. Both dates must be in YYYY-MM-DD format",
              };
            }

            // Validate dates are valid
            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);

            if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
              return {
                calendarItems: [],
                status: "Invalid date values in range",
              };
            }

            if (startDate > endDate) {
              return {
                calendarItems: [],
                status: "Start date must be before or equal to end date",
              };
            }

            whereClause.date = {
              [Op.between]: [startDateStr, endDateStr],
            };
          }
          // Support legacy YYYY-MM format for month filter
          else if (/^\d{4}-\d{2}$/.test(dateFilter)) {
            // Create start and end dates for the month
            const year = parseInt(dateFilter.split("-")[0]);
            const month = parseInt(dateFilter.split("-")[1]);

            if (month < 1 || month > 12) {
              return {
                calendarItems: [],
                status:
                  "Invalid month in date filter. Month must be between 01 and 12",
              };
            }

            const startDate = new Date(year, month - 1, 1); // month is 0-indexed
            const endDate = new Date(year, month, 0); // Last day of the month

            whereClause.date = {
              [Op.between]: [
                startDate.toISOString().split("T")[0],
                endDate.toISOString().split("T")[0],
              ],
            };
          } else {
            return {
              calendarItems: [],
              status:
                "Invalid date filter format. Use YYYY-MM for month or YYYY-MM-DD/YYYY-MM-DD for date range",
            };
          }
        }

        // Fetch calendar entries with outfit information
        const calendarEntries = await CalendarEntry.findAll({
          where: whereClause,
          order: [
            ["date", "ASC"],
            ["time", "ASC"],
          ],
        });

        // Get outfit IDs and fetch outfit data separately if needed
        const outfitIds = calendarEntries
          .map((entry: any) => entry.outfitId)
          .filter(Boolean);

        let outfitsMap: { [key: string]: any } = {};
        if (outfitIds.length > 0) {
          const outfits = await Outfit.findAll({
            where: {
              id: outfitIds,
            },
            attributes: ["id", "primaryImageUrl"],
          });

          outfitsMap = outfits.reduce((acc: any, outfit: any) => {
            acc[outfit.id] = outfit;
            return acc;
          }, {});
        }

        // Transform to the expected format
        const calendarItems = calendarEntries.map((entry: any) => {
          const outfit = entry.outfitId ? outfitsMap[entry.outfitId] : null;
          return {
            date: entry.date, // Already in YYYY-MM-DD format from DATEONLY
            isOccasion: !!entry.occasion, // True if there's a special occasion
            outfitId: entry.outfitId || null,
            outfitUrl: outfit?.primaryImageUrl || null,
            occasion: entry.occasion || null,
            weather: entry.weather || null,
          };
        });

        console.log(`Retrieved ${calendarItems.length} calendar entries`);

        return {
          calendarItems,
          status: `Successfully retrieved ${calendarItems.length} calendar entries`,
        };
      } catch (error) {
        console.error("Error in getUserCalendar:", error);
        return {
          calendarItems: [],
          status: `Error retrieving calendar: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        };
      }
    },
  },

  Mutation: {
    addOutfitToCalendar: async (
      _: any,
      {
        outfitId,
        date,
      }: {
        outfitId: string;
        date: string;
      },
      context: any,
    ) => {
      try {
        const auth = await authenticateUser(context);

        if (auth.error) return { status: "unable to authenticate user" };
        const userId = auth.user.userId;

        // Validate required fields
        if (!outfitId || !date) {
          return {
            status: "Missing required fields: outfitId and date are required",
          };
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return {
            status: "Invalid date format. Please use YYYY-MM-DD format",
          };
        }

        // Verify that the outfit exists and belongs to the user
        const outfit = await Outfit.findOne({
          where: {
            id: outfitId,
            userId: userId,
          },
        });

        if (!outfit) {
          return {
            status:
              "Outfit not found or you don't have permission to access it",
          };
        }

        // Check if there's already a calendar entry for this user at the same date
        const existingEntry = await CalendarEntry.findOne({
          where: {
            userId: userId,
            date: date,
          },
        });

        if (existingEntry) {
          // Update the existing entry
          await existingEntry.update({
            outfitId: outfitId,
          });

          console.log(`Updated calendar entry for user ${userId} on ${date}`);

          return {
            status:
              "Calendar entry updated successfully with the selected outfit",
          };
        } else {
          // Create a new calendar entry with default values
          await CalendarEntry.create({
            userId: userId,
            outfitId: outfitId,
            date: date,
            time: "12:00:00", // Default time
            occasion: "casual", // Default occasion
            weather: null, // No weather specified
          });

          console.log(
            `Created new calendar entry for user ${userId} on ${date}`,
          );

          return {
            status: "Outfit added to calendar successfully",
          };
        }
      } catch (error) {
        console.error("Error in addOutfitToCalendar:", error);
        return {
          status: `Error adding outfit to calendar: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        };
      }
    },

    swapOutfitOnCalendar: async (
      _: any,
      {
        oldOutfitId,
        newOutfitId,
        date,
      }: {
        oldOutfitId?: number; // Made optional for backward compatibility
        newOutfitId: number;
        date: string;
      },
      context: any,
    ) => {
      try {
        const auth = await authenticateUser(context);

        if (auth.error)
          return {
            status: "error",
            message: "Unable to authenticate user",
          };

        const userId = auth.user.userId;

        // Validate required fields
        if (!newOutfitId || !date) {
          return {
            status: "error",
            message:
              "Missing required fields: newOutfitId and date are required",
          };
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return {
            status: "error",
            message: "Invalid date format. Please use YYYY-MM-DD format",
          };
        }

        // Find the new outfit by id
        const newOutfit = await Outfit.findOne({
          where: {
            id: newOutfitId,
            userId: userId,
          },
        });

        if (!newOutfit) {
          return {
            status: "error",
            message: `New outfit with ID ${newOutfitId} not found or you don't have permission to access it`,
          };
        }

        // Check if there's a calendar entry for this user at the specified date
        let calendarEntry = await CalendarEntry.findOne({
          where: {
            userId: userId,
            date: date,
          },
        });

        // Store the old outfit ID for logging (if exists)
        const oldOutfitIdFromCalendar = calendarEntry?.outfitId || null;

        // If no calendar entry exists, create one
        if (!calendarEntry) {
          calendarEntry = await CalendarEntry.create({
            userId: userId,
            date: date,
            outfitId: newOutfit.id,
            isOccasion: false,
          });

          console.log(
            `Created calendar entry for user ${userId} on ${date} with outfit ID ${newOutfitId}`,
          );
        } else {
          // Delete/remove the old outfit and update with the new outfit
          await calendarEntry.update({
            outfitId: newOutfit.id,
          });

          console.log(
            `Swapped outfit on calendar for user ${userId} on ${date}: old ID ${oldOutfitIdFromCalendar || "none"} -> new ID ${newOutfitId}`,
          );
        }

        // Trigger multiple angle generation for the new outfit
        console.log(
          `Triggering angle generation for new outfit ${newOutfitId}...`,
        );

        // Call angle generation asynchronously (don't wait for it to complete)
        generateOutfitAnglesMutation(_, { outfitId: newOutfitId }, context)
          .then((angleResult) => {
            if (angleResult.success) {
              console.log(
                `✅ Angle generation queued successfully for outfit ${newOutfitId}`,
              );
            } else {
              console.warn(
                `⚠️ Angle generation failed for outfit ${newOutfitId}: ${angleResult.message}`,
              );
            }
          })
          .catch((error) => {
            console.error(
              `❌ Error triggering angle generation for outfit ${newOutfitId}:`,
              error,
            );
          });

        return {
          status: "success",
          message: `Successfully swapped outfit on ${date} to outfit ID ${newOutfitId}. Angle generation has been triggered.`,
        };
      } catch (error) {
        console.error("Error in swapOutfitOnCalendar:", error);
        return {
          status: "error",
          message: `Error swapping outfit on calendar: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        };
      }
    },

    deleteOutfitFromCalendar: async (
      _: any,
      { date }: { date: string },
      context: any,
    ) => {
      try {
        const auth = await authenticateUser(context);

        if (auth.error)
          return {
            status: "error",
            message: "Unable to authenticate user",
          };

        const userId = auth.user.userId;

        // Validate required fields
        if (!date) {
          return {
            status: "error",
            message: "Missing required field: date is required",
          };
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return {
            status: "error",
            message: "Invalid date format. Please use YYYY-MM-DD format",
          };
        }

        // Check if there's a calendar entry for this user at the specified date
        const calendarEntry = await CalendarEntry.findOne({
          where: {
            userId: userId,
            date: date,
          },
        });

        if (!calendarEntry) {
          return {
            status: "error",
            message: `No calendar entry found for date ${date}`,
          };
        }

        // Check if the calendar entry has an outfit
        if (!calendarEntry.outfitId) {
          return {
            status: "error",
            message: `Calendar entry on ${date} does not have an outfit assigned`,
          };
        }

        // Delete the calendar entry completely
        await calendarEntry.destroy();

        console.log(`Deleted calendar entry for user ${userId} on ${date}`);

        return {
          status: "success",
          message: `Successfully deleted calendar entry on ${date}`,
        };
      } catch (error) {
        console.error("Error in deleteOutfitFromCalendar:", error);
        return {
          status: "error",
          message: `Error deleting outfit from calendar: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        };
      }
    },
  },
};

export default calendarResolvers;
