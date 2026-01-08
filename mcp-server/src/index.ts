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
      }
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
                  description: "The ID (outfitUid) of the outfit",
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
