/**
 * GraphQL Resolvers for LangGraph Chat & Rating functionality
 * Integrates with LangGraph Service for AI-powered outfit chat and rating
 */

import { Outfit } from "../models/index";

interface ChatInput {
  message: string;
  outfitId?: number;
  imageUrl?: string;
  rating?: number;
  includeRating?: boolean;
}

interface RatingInput {
  outfitId: number;
  imageUrl?: string;
  chatInput?: string;
}

interface ChatResponse {
  success: boolean;
  message: string;
  output?: string;
}

interface RatingResponse {
  success: boolean;
  message: string;
  rating?: number;
  fullResponse?: string;
}

/**
 * Call LangGraph Service
 */
async function callLangGraphService(
  endpoint: string,
  payload: Record<string, any>,
): Promise<any> {
  const LANGGRAPH_SERVICE_URL =
    process.env.LANGGRAPH_SERVICE_URL || "http://langgraph-service:3002";
  const LANGGRAPH_API_KEY =
    process.env.LANGGRAPH_API_KEY ||
    "langgraph-secret-key-change-in-production";

  try {
    console.log(`🔄 Calling LangGraph ${endpoint} for user ${payload.userId}`);

    const response = await fetch(`${LANGGRAPH_SERVICE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": LANGGRAPH_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error(`❌ LangGraph error:`, error);
      throw new Error(error.error || "LangGraph service error");
    }

    const data = await response.json();
    console.log(`✅ LangGraph response received`);
    return data;
  } catch (error) {
    console.error(`❌ Error calling LangGraph:`, error);
    throw error;
  }
}

export const langgraphChatResolvers = {
  Mutation: {
    /**
     * Chat with AI about outfits
     * Routes to LangGraph Service for intelligent response
     */
    chatWithAI: async (
      _: any,
      { input }: { input: ChatInput },
      context: any,
    ): Promise<ChatResponse> => {
      try {
        // Verify user is authenticated
        if (!context.user?.userId) {
          return {
            success: false,
            message: "Authentication required",
          };
        }

        // Validate required fields
        if (!input.message) {
          return {
            success: false,
            message: "Message is required",
          };
        }

        console.log(
          `💬 Chat request from user ${
            context.user.userId
          }: "${input.message.substring(0, 50)}..."`,
        );

        // If outfitId is provided but imageUrl is not, fetch outfit's primary image
        let imageUrl = input.imageUrl;
        if (input.outfitId && !imageUrl) {
          console.log(`📸 Fetching image for outfit ${input.outfitId}`);
          const outfit = await Outfit.findOne({
            where: {
              id: input.outfitId,
              userId: context.user.userId,
            },
          });

          if (outfit && outfit.primaryImageUrl) {
            imageUrl = outfit.primaryImageUrl;
            console.log(`✅ Found outfit image: ${imageUrl}`);
          } else {
            console.log(`⚠️ No image found for outfit ${input.outfitId}`);
          }
        }

        // Call LangGraph Service
        const response = await callLangGraphService("/chat", {
          message: input.message,
          userId: context.user.userId,
          outfitId: input.outfitId,
          imageUrl: imageUrl,
          rating: input.rating,
          includeRating: input.includeRating,
        });

        return {
          success: true,
          message: "Chat response generated successfully",
          output: response.output,
        };
      } catch (error: any) {
        console.error("Error in chatWithAI resolver:", error);
        return {
          success: false,
          message: error.message || "Failed to generate chat response",
        };
      }
    },

    /**
     * Rate an outfit using AI
     * Calls LangGraph Service to generate a rating based on fashion principles
     */
    rateOutfit: async (
      _: any,
      { input }: { input: RatingInput },
      context: any,
    ): Promise<RatingResponse> => {
      try {
        // Verify user is authenticated
        if (!context.user?.userId) {
          return {
            success: false,
            message: "Authentication required",
          };
        }

        // Validate required fields
        if (!input.outfitId) {
          return {
            success: false,
            message: "Outfit ID is required",
          };
        }

        console.log(
          `⭐ Rating request from user ${context.user.userId} for outfit ${input.outfitId}`,
        );

        // If imageUrl is not provided, fetch outfit's primary image
        let imageUrl = input.imageUrl;
        if (!imageUrl) {
          console.log(`📸 Fetching image for outfit ${input.outfitId}`);
          const outfit = await Outfit.findOne({
            where: {
              id: input.outfitId,
              userId: context.user.userId,
            },
          });

          if (outfit && outfit.primaryImageUrl) {
            imageUrl = outfit.primaryImageUrl;
            console.log(`✅ Found outfit image: ${imageUrl}`);
          } else {
            console.log(`⚠️ No image found for outfit ${input.outfitId}`);
          }
        }

        // Call LangGraph Service
        const response = await callLangGraphService("/rating", {
          userId: context.user.userId,
          outfitId: input.outfitId,
          imageUrl: imageUrl,
          chatInput: input.chatInput,
        });

        const rating = parseFloat(response.output);

        return {
          success: true,
          message: "Outfit rated successfully",
          rating: isNaN(rating) ? null : rating,
          fullResponse: response.fullResponse,
        };
      } catch (error: any) {
        console.error("Error in rateOutfit resolver:", error);
        return {
          success: false,
          message: error.message || "Failed to rate outfit",
        };
      }
    },
  },
};

export default langgraphChatResolvers;
