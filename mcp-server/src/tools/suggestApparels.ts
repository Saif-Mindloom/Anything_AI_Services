import { z } from "zod";
import { executeQuery } from "../graphql-client.js";

/**
 * Schema for suggestApparels input
 */
export const SuggestApparelsSchema = z.object({
  userId: z.string().describe("The ID of the user"),
  outfitId: z.number().describe("The outfit ID to suggest improvements for"),
  targetCategory: z
    .string()
    .describe("Category to suggest replacements for: top, bottom, shoe, dress"),
  currentRating: z.number().optional().describe("Current outfit rating (0-10)"),
  preferredColors: z
    .array(z.string())
    .optional()
    .describe("Preferred colors for suggestions"),
});

/**
 * GraphQL queries
 */
const GET_OUTFIT_QUERY = `
  query GetOutfitById($outfitId: Int!, $userId: String!) {
    getOutfitById(outfitId: $outfitId, userId: $userId) {
      id
      outfitUid
      topId
      bottomId
      shoeId
      dressId
      rating
    }
  }
`;

const GET_USER_APPARELS_QUERY = `
  query GetFilteredUserApparels(
    $userId: String!
    $category: String
    $colors: [String!]
  ) {
    getFilteredUserApparels(
      userId: $userId
      category: $category
      colors: $colors
    ) {
      id
      category
      subcategory
      brand
      name
      colors
      material
      urlProcessed
      favorite
    }
  }
`;

interface Apparel {
  id: number;
  category: string;
  subcategory: string;
  brand?: string;
  name?: string;
  colors: string[];
  material: string;
  urlProcessed?: string;
  favorite: boolean;
}

/**
 * Suggest alternative apparels to improve outfit rating
 * This tool analyzes the current outfit and suggests replacements from the user's wardrobe
 */
export async function suggestApparels(
  args: z.infer<typeof SuggestApparelsSchema>
) {
  try {
    const { userId, outfitId, targetCategory, currentRating, preferredColors } =
      args;

    // 1. Get current outfit details
    const outfitResponse = await executeQuery<any>(GET_OUTFIT_QUERY, {
      outfitId,
      userId,
    });
    const outfit = outfitResponse.getOutfitById;

    if (!outfit) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Outfit ${outfitId} not found`,
            }),
          },
        ],
        isError: true,
      };
    }

    // 2. Get the current item ID being used in this category
    const categoryToIdMap: Record<string, string> = {
      top: "topId",
      bottom: "bottomId",
      shoe: "shoeId",
      dress: "dressId",
    };
    const currentItemId = outfit[categoryToIdMap[targetCategory]];

    // 3. Get alternative apparels from user's wardrobe
    const apparelsResponse = await executeQuery<any>(GET_USER_APPARELS_QUERY, {
      userId,
      category: targetCategory,
      colors: preferredColors,
    });

    const apparels: Apparel[] = apparelsResponse.getFilteredUserApparels || [];

    // 4. Filter out the current item and prioritize suggestions
    const suggestions = apparels
      .filter((apparel) => apparel.id !== currentItemId)
      .map((apparel) => {
        // Calculate a simple suggestion score
        let score = 0;

        // Prioritize favorite items
        if (apparel.favorite) score += 3;

        // Prioritize items with preferred colors
        if (
          preferredColors &&
          apparel.colors.some((c) => preferredColors.includes(c))
        ) {
          score += 2;
        }

        // Prioritize items with brand
        if (apparel.brand) score += 1;

        return { ...apparel, suggestionScore: score };
      })
      .sort((a, b) => b.suggestionScore - a.suggestionScore)
      .slice(0, 5); // Top 5 suggestions

    const suggestionText =
      currentRating && currentRating < 7
        ? `The current outfit has a rating of ${currentRating}/10. Here are ${suggestions.length} alternative ${targetCategory} items that might improve the outfit:`
        : `Here are ${suggestions.length} alternative ${targetCategory} items from your wardrobe:`;

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              currentOutfit: {
                outfitId: outfit.outfitUid,
                currentRating: outfit.rating || currentRating,
                targetCategory,
                currentItemId,
              },
              suggestions: suggestions.map(
                ({ suggestionScore, ...apparel }) => apparel
              ),
              suggestionsCount: suggestions.length,
              message: suggestionText,
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
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
}
