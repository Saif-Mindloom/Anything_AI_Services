import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { config } from "./config.js";
import {
  getUserApparels,
  GetUserApparelsSchema,
} from "./tools/getUserApparels.js";
import {
  getOutfitDetails,
  GetOutfitDetailsSchema,
} from "./tools/getOutfitDetails.js";
import {
  getUserProfile,
  GetUserProfileSchema,
} from "./tools/getUserProfile.js";
import {
  suggestApparels,
  SuggestApparelsSchema,
} from "./tools/suggestApparels.js";
import {
  getWeatherForecast,
  GetWeatherForecastSchema,
} from "./tools/getWeatherForecast.js";
import { getOccasions, GetOccasionsSchema } from "./tools/getOccasions.js";

/**
 * MCP Server for Anything AI Backend
 * Exposes backend data and functionality as MCP tools
 */
class AnythingAIMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "anything-ai-mcp-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    /**
     * Handler for listing available tools
     */
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "get_user_apparels",
            description:
              "Get all apparel items from a user's wardrobe with optional filtering by category, subcategory, colors, or favorite status. Use this to see what clothing items a user owns.",
            inputSchema: {
              type: "object",
              properties: {
                userId: {
                  type: "string",
                  description: "The ID of the user",
                },
                category: {
                  type: "string",
                  description:
                    "Filter by category: top, bottom, shoe, accessory, outerwear, dress",
                  enum: [
                    "top",
                    "bottom",
                    "shoe",
                    "accessory",
                    "outerwear",
                    "dress",
                  ],
                },
                subcategory: {
                  type: "string",
                  description:
                    "Filter by subcategory (e.g., tshirt, jeans, sneakers)",
                },
                colors: {
                  type: "array",
                  items: { type: "string" },
                  description: "Filter by colors",
                },
                favorite: {
                  type: "boolean",
                  description: "Filter by favorite status",
                },
              },
              required: ["userId"],
            },
          },
          {
            name: "get_outfit_details",
            description:
              "Get detailed information about a specific outfit including all apparel items (top, bottom, shoes, dress), images, and rating. Use this to analyze a specific outfit.",
            inputSchema: {
              type: "object",
              properties: {
                outfitId: {
                  type: "number",
                  description: "The ID of the outfit",
                },
                userId: {
                  type: "string",
                  description: "The ID of the user who owns the outfit",
                },
              },
              required: ["outfitId", "userId"],
            },
          },
          {
            name: "get_user_profile",
            description:
              "Get user profile information including name, email, height, weight, and gender. Use this to understand user preferences and context.",
            inputSchema: {
              type: "object",
              properties: {
                userId: {
                  type: "string",
                  description: "The ID of the user",
                },
              },
              required: ["userId"],
            },
          },
          {
            name: "suggest_apparels",
            description:
              "Suggest alternative apparel items from the user's wardrobe to improve an outfit. This analyzes the current outfit and recommends replacements for a specific category (top, bottom, shoe, or dress) based on colors, style, and favorites. Use this when the outfit rating is low or the user asks for suggestions.",
            inputSchema: {
              type: "object",
              properties: {
                userId: {
                  type: "string",
                  description: "The ID of the user",
                },
                outfitId: {
                  type: "number",
                  description: "The outfit ID to suggest improvements for",
                },
                targetCategory: {
                  type: "string",
                  description: "Category to suggest replacements for",
                  enum: ["top", "bottom", "shoe", "dress"],
                },
                currentRating: {
                  type: "number",
                  description: "Current outfit rating (0-10)",
                },
                preferredColors: {
                  type: "array",
                  items: { type: "string" },
                  description: "Preferred colors for suggestions",
                },
              },
              required: ["userId", "outfitId", "targetCategory"],
            },
          },
          {
            name: "get_weather_forecast",
            description:
              "Get weather forecast for the current week (up to 7 days). Provides temperature, weather conditions, and precipitation probability. Use this to help users choose weather-appropriate outfits and plan their wardrobe for the week.",
            inputSchema: {
              type: "object",
              properties: {
                location: {
                  type: "string",
                  description:
                    "Location for weather forecast (e.g., 'Mumbai, India', 'Delhi'). Defaults to 'Mumbai, India' if not specified.",
                },
                days: {
                  type: "number",
                  description:
                    "Number of days for forecast (1-7). Defaults to 7 for weekly forecast.",
                  minimum: 1,
                  maximum: 7,
                },
              },
            },
          },
          {
            name: "get_occasions",
            description:
              "Get information about Indian holidays and special occasions including festivals like Diwali, Eid, Holi, Christmas, etc. Provides details about today's occasion, current week's holidays, and upcoming events. Use this to suggest occasion-appropriate traditional or festive outfits.",
            inputSchema: {
              type: "object",
              properties: {
                includeUpcoming: {
                  type: "boolean",
                  description:
                    "Whether to include upcoming occasions (next 30 days). Defaults to true.",
                },
                religion: {
                  type: "string",
                  description:
                    "Filter occasions by religion: 'hindu', 'muslim', 'christian', 'sikh', or 'all'.",
                  enum: ["hindu", "muslim", "christian", "sikh", "all"],
                },
              },
            },
          },
        ],
      };
    });

    /**
     * Handler for tool execution
     */
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "get_user_apparels": {
            const validatedArgs = GetUserApparelsSchema.parse(args);
            return await getUserApparels(validatedArgs);
          }

          case "get_outfit_details": {
            const validatedArgs = GetOutfitDetailsSchema.parse(args);
            return await getOutfitDetails(validatedArgs);
          }

          case "get_user_profile": {
            const validatedArgs = GetUserProfileSchema.parse(args);
            return await getUserProfile(validatedArgs);
          }

          case "suggest_apparels": {
            const validatedArgs = SuggestApparelsSchema.parse(args);
            return await suggestApparels(validatedArgs);
          }

          case "get_weather_forecast": {
            const validatedArgs = GetWeatherForecastSchema.parse(args);
            const result = await getWeatherForecast(validatedArgs);
            return {
              content: [
                {
                  type: "text",
                  text: result,
                },
              ],
            };
          }

          case "get_occasions": {
            const validatedArgs = GetOccasionsSchema.parse(args);
            const result = await getOccasions(validatedArgs);
            return {
              content: [
                {
                  type: "text",
                  text: result,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
              }),
            },
          ],
          isError: true,
        };
      }
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Anything AI MCP Server running on stdio");
  }
}

// Start the server
const server = new AnythingAIMCPServer();
server.start().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
