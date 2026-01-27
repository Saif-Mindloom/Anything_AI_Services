import { z } from "zod";
import { OccasionsService } from "../services/occasionsService.js";

/**
 * Schema for getOccasions tool
 */
export const GetOccasionsSchema = z.object({
  includeUpcoming: z
    .boolean()
    .optional()
    .describe(
      "Whether to include upcoming occasions (next 30 days). Defaults to true"
    ),
  religion: z
    .enum(["hindu", "muslim", "christian", "sikh", "all"])
    .optional()
    .describe("Filter occasions by religion. Use 'all' for all religions"),
  specificDate: z
    .string()
    .optional()
    .describe(
      "Check for occasions on a specific date (YYYY-MM-DD format). Use 'tomorrow', 'today', or a date string"
    ),
});

export type GetOccasionsInput = z.infer<typeof GetOccasionsSchema>;

/**
 * Get Indian holidays and occasions
 * Provides information about current week's occasions and upcoming holidays
 */
export async function getOccasions(input: GetOccasionsInput): Promise<string> {
  try {
    const includeUpcoming = input.includeUpcoming !== false; // Default to true
    const occasionsService = new OccasionsService();

    console.log("Fetching occasion information");

    // Handle specific date queries
    if (input.specificDate) {
      let checkDate: Date;
      const today = new Date();
      const lowerDate = input.specificDate.toLowerCase();

      if (lowerDate === "today") {
        checkDate = today;
      } else if (lowerDate === "tomorrow") {
        checkDate = new Date(today);
        checkDate.setDate(today.getDate() + 1);
      } else {
        // Parse the date string
        checkDate = new Date(input.specificDate);
      }

      const dateStr = checkDate.toISOString().split("T")[0];
      const occasion = occasionsService.isHoliday(dateStr);

      if (occasion) {
        let response = `🎉 OCCASION ON ${dateStr}:\n`;
        response += `${occasion.name} - ${occasion.description}\n`;
        response += `Type: ${occasion.type}${
          occasion.religion ? `, Religion: ${occasion.religion}` : ""
        }\n\n`;

        // Add fashion advice
        const fashionAdvice =
          occasionsService.getOccasionFashionAdvice(occasion);
        response += `Fashion Recommendation: ${fashionAdvice}\n`;
        return response;
      } else {
        return `No special occasion found on ${dateStr}.`;
      }
    }

    // Get comprehensive occasion info
    const occasionInfo = occasionsService.getOccasionInfo();

    // Build the response
    let response = "";

    if (occasionInfo.todayOccasion) {
      response += `🎉 TODAY'S SPECIAL OCCASION:\n`;
      response += `${occasionInfo.todayOccasion.name} - ${occasionInfo.todayOccasion.description}\n`;
      response += `Type: ${occasionInfo.todayOccasion.type}\n`;

      // Add fashion advice for today's occasion
      const fashionAdvice = occasionsService.getOccasionFashionAdvice(
        occasionInfo.todayOccasion
      );
      response += `Fashion Recommendation: ${fashionAdvice}\n\n`;
    }

    if (occasionInfo.currentWeekHolidays.length > 0) {
      response += `📅 THIS WEEK'S OCCASIONS:\n`;
      occasionInfo.currentWeekHolidays.forEach((holiday) => {
        response += `• ${holiday.name} (${holiday.date}):\n`;
        response += `  ${holiday.description}\n`;
        response += `  Type: ${holiday.type}${
          holiday.religion ? `, Religion: ${holiday.religion}` : ""
        }\n`;
      });
      response += "\n";
    } else if (!occasionInfo.todayOccasion) {
      response += "No special occasions this week.\n\n";
    }

    if (includeUpcoming && occasionInfo.upcomingHolidays.length > 0) {
      response += `🔮 UPCOMING OCCASIONS (Next 30 Days):\n`;
      occasionInfo.upcomingHolidays.slice(0, 5).forEach((holiday) => {
        response += `• ${holiday.name} (${holiday.date}): ${holiday.description}\n`;
      });

      if (occasionInfo.upcomingHolidays.length > 5) {
        response += `... and ${
          occasionInfo.upcomingHolidays.length - 5
        } more\n`;
      }
      response += "\n";
    }

    // Filter by religion if specified
    if (input.religion) {
      response += `\nFiltered by religion: ${input.religion}\n`;
      const filtered = occasionsService.getHolidaysByReligion(input.religion);
      if (filtered.length > 0) {
        response += `\nAll ${input.religion} occasions in 2026:\n`;
        filtered.forEach((holiday) => {
          response += `• ${holiday.name} (${holiday.date})\n`;
        });
      }
    }

    response += `\n💡 TIP: Use occasion information to suggest appropriate outfits. Traditional attire is often preferred for religious festivals, while smart casuals work for most cultural events.`;

    return response;
  } catch (error) {
    console.error("Error in getOccasions:", error);
    return `Failed to fetch occasions: ${
      error instanceof Error ? error.message : "Unknown error"
    }`;
  }
}
