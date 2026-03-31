import axios from "axios";
import { Outfit } from "../models/outfit.model";

/**
 * Service to interact with LangGraph AI service
 * Replaces n8n webhook functionality with direct LangGraph integration
 */

interface RatingInput {
  userId: string;
  outfitId: number;
  imageUrl: string;
  chatInput?: string;
}

interface RatingResponse {
  success: boolean;
  output: string; // The rating value as string (e.g., "6.8")
  fullResponse?: string;
}

interface ChatInput {
  message: string;
  userId: string;
  outfitId?: number;
  rating?: number;
  includeRating: boolean;
  imageUrl?: string;
}

interface ChatResponse {
  success: boolean;
  output: string;
}

// LangGraph service configuration
const LANGGRAPH_SERVICE_URL =
  process.env.LANGGRAPH_SERVICE_URL || "http://localhost:3002";
const LANGGRAPH_API_KEY = process.env.LANGGRAPH_API_KEY || "";

/**
 * Call the LangGraph rating endpoint to get an outfit rating
 */
export async function callRatingService(input: RatingInput): Promise<number> {
  try {
    console.log(
      `📊 Calling LangGraph rating service for outfit: ${input.outfitId}`,
    );

    // Make the request to LangGraph service
    const response = await axios.post<RatingResponse>(
      `${LANGGRAPH_SERVICE_URL}/rating`,
      {
        userId: input.userId,
        outfitId: input.outfitId,
        imageUrl: input.imageUrl,
        chatInput:
          input.chatInput ||
          "Rate this outfit from 1.0 to 10.0 based on fashion principles. Return only the numeric rating.",
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": LANGGRAPH_API_KEY,
        },
        timeout: 60000, // 60 second timeout
      },
    );

    console.log(`✅ Rating service response:`, response.data);

    // Parse the rating value
    const ratingValue = parseFloat(response.data.output);

    if (isNaN(ratingValue)) {
      throw new Error(`Invalid rating value received: ${response.data.output}`);
    }

    return ratingValue;
  } catch (error) {
    console.error("❌ Error calling rating service:", error);
    if (axios.isAxiosError(error)) {
      console.error("Response data:", error.response?.data);
      console.error("Response status:", error.response?.status);
    }
    throw error;
  }
}

/**
 * Generate a rating for an outfit and store it in the database
 */
export async function generateAndStoreOutfitRating(
  outfitId: number,
  userId: string,
): Promise<number> {
  try {
    // Get the outfit
    const outfit = await Outfit.findOne({ where: { id: outfitId } });

    if (!outfit) {
      throw new Error(`Outfit ${outfitId} not found`);
    }

    // Get the 90-degree image (front-facing view) for rating
    let imageUrl: string;

    if (outfit.imageList && typeof outfit.imageList === "object") {
      const imageList = outfit.imageList as { [key: string]: string };
      imageUrl = imageList["90"] || outfit.primaryImageUrl || "";
    } else {
      imageUrl = outfit.primaryImageUrl || "";
    }

    if (!imageUrl) {
      throw new Error(`No image available for outfit ${outfitId}`);
    }

    console.log(
      `🎯 Generating rating for outfit ${outfitId} using image: ${imageUrl}`,
    );

    // Call the rating service
    const rating = await callRatingService({
      userId: userId,
      outfitId: outfitId,
      imageUrl: imageUrl,
    });

    // Update the outfit with the rating
    await outfit.update({ rating });

    console.log(`✅ Stored rating ${rating} for outfit ${outfitId}`);

    return rating;
  } catch (error) {
    console.error(`❌ Error generating rating for outfit ${outfitId}:`, error);
    throw error;
  }
}

/**
 * Call LangGraph chat service
 */
export async function callChatService(input: ChatInput): Promise<string> {
  try {
    console.log(
      `💬 Calling LangGraph chat service for user: ${input.userId}, includeRating: ${input.includeRating}`,
    );

    // Make the request to LangGraph service
    const response = await axios.post<ChatResponse>(
      `${LANGGRAPH_SERVICE_URL}/chat`,
      input,
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": LANGGRAPH_API_KEY,
        },
        timeout: 60000, // 60 second timeout
      },
    );

    if (!response.data.success) {
      throw new Error("LangGraph chat service returned unsuccessful response");
    }

    console.log(
      `✅ Chat service response received (length: ${response.data.output.length} chars)`,
    );

    return response.data.output;
  } catch (error) {
    console.error("❌ Error calling chat service:", error);
    if (axios.isAxiosError(error)) {
      console.error("Response data:", error.response?.data);
      console.error("Response status:", error.response?.status);
    }
    throw new Error("Failed to get AI response. Please try again.");
  }
}
