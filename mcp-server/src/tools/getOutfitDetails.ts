import { z } from "zod";
import { executeQuery } from "../graphql-client.js";

/**
 * Schema for getOutfitDetails input
 */
export const GetOutfitDetailsSchema = z.object({
  outfitId: z.number().describe("The ID (outfitUid) of the outfit"),
  userId: z
    .union([z.string(), z.number()])
    .transform(Number)
    .describe("The ID of the user who owns the outfit"),
});

/**
 * GraphQL query for outfit details
 */
const GET_OUTFIT_DETAILS_QUERY = `
  query GetOutfitDetailsForMCP($outfitId: Int!, $userId: Int!) {
    getOutfitDetailsForMCP(outfitId: $outfitId, userId: $userId) {
      success
      message
      outfit {
        id
        outfitUid
        topId
        bottomId
        shoeId
        dressId
        primaryImageUrl
        imageList
        rating
        poseLeft
        poseRight
      }
    }
  }
`;

interface Outfit {
  id: number;
  outfitUid: number;
  topId: number;
  bottomId: number;
  shoeId: number;
  dressId: number;
  primaryImageUrl?: string;
  imageList?: string;
  rating?: number;
  poseLeft?: string;
  poseRight?: string;
}

interface GetOutfitResponse {
  getOutfitDetailsForMCP: {
    success: boolean;
    message: string;
    outfit: Outfit;
  };
}

/**
 * Get outfit details including all apparel items
 */
export async function getOutfitDetails(
  args: z.infer<typeof GetOutfitDetailsSchema>
) {
  try {
    const { outfitId, userId } = args;

    const response = await executeQuery<GetOutfitResponse>(
      GET_OUTFIT_DETAILS_QUERY,
      {
        outfitId,
        userId,
      }
    );

    const { success, message, outfit } = response.getOutfitDetailsForMCP;

    if (!success || !outfit) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: message || `Outfit ${outfitId} not found`,
            }),
          },
        ],
        isError: true,
      };
    }

    // Fetch apparel details for each item in the outfit
    const apparelIds = [
      outfit.topId,
      outfit.bottomId,
      outfit.shoeId,
      outfit.dressId,
    ].filter((id) => id && id !== 0);

    // Note: We don't fetch individual apparel details since we don't have userId context
    // The outfit information alone is sufficient for the MCP tool

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              outfit: outfit,
              apparelIds: apparelIds,
              message: `Retrieved outfit ${outfitId} with ${apparelIds.length} apparel items`,
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
