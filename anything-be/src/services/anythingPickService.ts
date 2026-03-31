import axios from "axios";
import { Op } from "sequelize";
import { Outfit } from "../models/outfit.model";
import { AnythingPick, UsedAnythingPick } from "../models/anythingPick.model";
import { Apparel } from "../models/apparel.model";

/**
 * Service to manage daily "Anything Pick" - AI-selected outfit of the day
 */

interface OutfitSelectionInput {
  userId: number;
  weather?: number;
  occasion?: string;
}

interface OutfitSelectionResponse {
  success: boolean;
  selectedOutfitId?: number;
  reason?: string;
  error?: string;
}

// LangGraph service configuration
const LANGGRAPH_SERVICE_URL =
  process.env.LANGGRAPH_SERVICE_URL || "http://localhost:3002";
const LANGGRAPH_API_KEY = process.env.LANGGRAPH_API_KEY || "";

/**
 * Get today's date as DATEONLY string (YYYY-MM-DD)
 */
function getTodayDateString(): string {
  return new Date().toISOString().split("T")[0];
}

/**
 * Get available outfits (not yet used in Anything Pick)
 */
async function getAvailableOutfits(userId: number): Promise<Outfit[]> {
  // Get all used outfit IDs
  const usedOutfits = await UsedAnythingPick.findAll({
    where: { userId },
    attributes: ["outfitId"],
  });

  const usedOutfitIds = usedOutfits.map((u) => u.outfitId);

  // Get visible outfits that haven't been used yet
  const whereClause: any = {
    userId,
    visible: true,
  };

  if (usedOutfitIds.length > 0) {
    whereClause.id = { [Op.notIn]: usedOutfitIds };
  }

  const availableOutfits = await Outfit.findAll({
    where: whereClause,
    order: [
      ["rating", "DESC NULLS LAST"],
      ["updatedAt", "DESC"],
    ],
  });

  return availableOutfits;
}

/**
 * Reset used outfits list when all outfits have been shown
 */
async function resetUsedOutfits(userId: number): Promise<void> {
  console.log(`♻️ Resetting used outfits for user ${userId}`);
  await UsedAnythingPick.destroy({ where: { userId } });
}

/**
 * Build outfit descriptions for LLM
 */
async function buildOutfitDescriptions(outfits: Outfit[]): Promise<string> {
  const descriptions = await Promise.all(
    outfits.map(async (outfit, index) => {
      const parts: string[] = [];

      // Get apparel details
      if (outfit.topId && outfit.topId !== 0) {
        const top = await Apparel.findByPk(outfit.topId);
        if (top)
          parts.push(
            `${top.category}: ${top.name || JSON.stringify(top.colors)}`,
          );
      }

      if (outfit.bottomId && outfit.bottomId !== 0) {
        const bottom = await Apparel.findByPk(outfit.bottomId);
        if (bottom)
          parts.push(
            `${bottom.category}: ${bottom.name || JSON.stringify(bottom.colors)}`,
          );
      }

      if (outfit.dressId && outfit.dressId !== 0) {
        const dress = await Apparel.findByPk(outfit.dressId);
        if (dress)
          parts.push(
            `${dress.category}: ${dress.name || JSON.stringify(dress.colors)}`,
          );
      }

      if (outfit.shoeId && outfit.shoeId !== 0) {
        const shoe = await Apparel.findByPk(outfit.shoeId);
        if (shoe)
          parts.push(
            `${shoe.category}: ${shoe.name || JSON.stringify(shoe.colors)}`,
          );
      }

      const outfitDesc = parts.length > 0 ? parts.join(", ") : "Mixed outfit";
      const ratingStr = outfit.rating
        ? ` (rating: ${outfit.rating.toFixed(1)})`
        : "";
      const summaryStr = outfit.outfitSummary
        ? `\n  Summary: ${outfit.outfitSummary}`
        : "";

      return `${index + 1}. Outfit ID ${outfit.id}: ${outfitDesc}${ratingStr}${summaryStr}`;
    }),
  );

  return descriptions.join("\n");
}

/**
 * Call LangGraph to select outfit based on context
 */
async function selectOutfitWithAI(
  outfits: Outfit[],
  weather?: number,
  occasion?: string,
): Promise<{ outfitId: number; reason: string }> {
  try {
    const outfitDescriptions = await buildOutfitDescriptions(outfits);
    const outfitIds = outfits.map((o) => o.id);

    // Build context
    const weatherStr = weather
      ? `Current weather: ${weather}°F`
      : "Weather: Not specified";
    const occasionStr = occasion
      ? `Occasion: ${occasion}`
      : "Occasion: Casual/everyday";

    const prompt = `You are a fashion stylist AI selecting today's outfit for the user.

${weatherStr}
${occasionStr}

Available outfits:
${outfitDescriptions}

Select ONE outfit that best matches the weather and occasion. Consider:
- Weather appropriateness (temperature, conditions)
- Occasion suitability
- Outfit ratings (higher is better)
- Style variety

Respond ONLY with a JSON object in this exact format:
{
  "outfitId": <the outfit ID number>,
  "reason": "<brief 1-2 sentence explanation>"
}

Do not include any other text before or after the JSON.`;

    console.log("🤖 Calling LangGraph to select outfit...");

    const response = await axios.post(
      `${LANGGRAPH_SERVICE_URL}/chat`,
      {
        message: prompt,
        userId: "system",
        includeRating: false,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": LANGGRAPH_API_KEY,
        },
        timeout: 30000,
      },
    );

    if (!response.data.success) {
      throw new Error("LangGraph returned unsuccessful response");
    }

    const output = response.data.output;
    console.log("✅ LangGraph raw response:", output);

    // Try to extract JSON from the response
    let jsonMatch = output.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in LangGraph response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.outfitId || !parsed.reason) {
      throw new Error("Invalid JSON structure from LangGraph");
    }

    // Validate that the selected outfit ID is in the available list
    if (!outfitIds.includes(parsed.outfitId)) {
      throw new Error(
        `Selected outfit ID ${parsed.outfitId} not in available outfits`,
      );
    }

    return {
      outfitId: parsed.outfitId,
      reason: parsed.reason,
    };
  } catch (error) {
    console.error("❌ Error calling LangGraph for outfit selection:", error);

    // Fallback: select highest rated outfit
    const fallbackOutfit = outfits[0]; // Already sorted by rating DESC
    return {
      outfitId: fallbackOutfit.id,
      reason: "Selected based on highest rating (AI selection unavailable)",
    };
  }
}

/**
 * Get or generate today's Anything Pick for a user
 */
export async function getTodaysAnythingPick(
  input: OutfitSelectionInput,
): Promise<AnythingPick | null> {
  const { userId, weather, occasion } = input;
  const today = getTodayDateString();

  try {
    console.log(`🎯 Getting Anything Pick for user ${userId} on ${today}`);

    // Check if there's already a pick for today
    const existingPick = await AnythingPick.findOne({
      where: {
        userId,
        selectedDate: today,
      },
    });

    if (existingPick) {
      console.log(
        `✅ Found existing Anything Pick: Outfit ${existingPick.outfitId}`,
      );
      return existingPick;
    }

    // Generate new pick
    console.log("🔄 No existing pick found, generating new one...");

    // Get available outfits
    let availableOutfits = await getAvailableOutfits(userId);

    // If no available outfits (all have been used), reset the list
    if (availableOutfits.length === 0) {
      console.log("♻️ All outfits used, resetting...");
      await resetUsedOutfits(userId);
      availableOutfits = await getAvailableOutfits(userId);
    }

    // If still no outfits, user has no visible outfits
    if (availableOutfits.length === 0) {
      console.log("⚠️ No visible outfits found for user");
      return null;
    }

    // Use AI to select outfit
    const selection = await selectOutfitWithAI(
      availableOutfits,
      weather,
      occasion,
    );

    // Create the pick record
    const newPick = await AnythingPick.create({
      userId,
      outfitId: selection.outfitId,
      selectedDate: today,
      weather,
      occasion,
      reason: selection.reason,
    });

    // Mark outfit as used
    await UsedAnythingPick.create({
      userId,
      outfitId: selection.outfitId,
    });

    console.log(
      `✅ Created new Anything Pick: Outfit ${selection.outfitId} - ${selection.reason}`,
    );

    return newPick;
  } catch (error) {
    console.error("❌ Error in getTodaysAnythingPick:", error);
    throw error;
  }
}

/**
 * Get Anything Pick with outfit details populated
 */
export async function getAnythingPickWithOutfit(
  userId: number,
  weather?: number,
  occasion?: string,
): Promise<{ outfit: Outfit; pick: AnythingPick } | null> {
  try {
    const pick = await getTodaysAnythingPick({ userId, weather, occasion });

    if (!pick) {
      return null;
    }

    const outfit = await Outfit.findByPk(pick.outfitId);

    if (!outfit) {
      console.error(`⚠️ Outfit ${pick.outfitId} not found for pick ${pick.id}`);
      return null;
    }

    return { outfit, pick };
  } catch (error) {
    console.error("❌ Error in getAnythingPickWithOutfit:", error);
    throw error;
  }
}
