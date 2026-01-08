import { z } from "zod";
import { executeQuery } from "../graphql-client.js";

/**
 * Schema for getOutfitDetails input
 */
export const GetOutfitDetailsSchema = z.object({
  outfitId: z.number().describe("The ID (outfitUid) of the outfit"),
  userId: z.string().describe("The ID of the user who owns the outfit"),
});

/**
 * GraphQL query for outfit details
 */
const GET_OUTFIT_DETAILS_QUERY = `
  query GetOutfitById($outfitId: Int!, $userId: String!) {
    getOutfitById(outfitId: $outfitId, userId: $userId) {
      id
      outfitUid
      userId
      topId
      bottomId
      shoeId
      dressId
      primaryImageUrl
      imageList
      rating
      visible
      favourite
    }
  }
`;

interface Outfit {
  id: number;
  outfitUid: number;
  userId: number;
  topId: number;
  bottomId: number;
  shoeId: number;
  dressId: number;
  primaryImageUrl?: string;
  imageList?: Record<string, string>;
  rating?: number;
  visible: boolean;
  favourite: boolean;
}

interface GetOutfitResponse {
  getOutfitById: Outfit;
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

    const outfit = response.getOutfitById;

    if (!outfit) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Outfit ${outfitId} not found for user ${userId}`,
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

    let apparelDetails = [];
    if (apparelIds.length > 0) {
      const GET_APPAREL_BY_ID_QUERY = `
        query GetUserApparelById($userId: String!, $apparelId: Int!) {
          getUserApparelById(userId: $userId, apparelId: $apparelId) {
            id
            category
            subcategory
            brand
            name
            colors
            urlProcessed
          }
        }
      `;

      apparelDetails = await Promise.all(
        apparelIds.map(async (apparelId) => {
          try {
            const apparelResponse = await executeQuery<any>(
              GET_APPAREL_BY_ID_QUERY,
              {
                userId,
                apparelId,
              }
            );
            return apparelResponse.getUserApparelById;
          } catch {
            return null;
          }
        })
      );
      apparelDetails = apparelDetails.filter(Boolean);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              outfit: {
                ...outfit,
                apparels: apparelDetails,
              },
              message: `Retrieved outfit ${outfitId} with ${apparelDetails.length} apparel items`,
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
