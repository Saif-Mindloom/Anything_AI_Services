import { z } from "zod";
import { executeQuery } from "../graphql-client.js";

/**
 * Schema for getUserApparels input
 */
export const GetUserApparelsSchema = z.object({
  userId: z.string().describe("The ID of the user"),
  category: z
    .string()
    .optional()
    .describe(
      "Filter by category: top, bottom, shoe, accessory, outerwear, dress"
    ),
  subcategory: z.string().optional().describe("Filter by subcategory"),
  colors: z.array(z.string()).optional().describe("Filter by colors"),
  favorite: z.boolean().optional().describe("Filter by favorite status"),
});

/**
 * GraphQL query for user apparels
 */
const GET_USER_APPARELS_QUERY = `
  query GetUserApparels($limit: Int, $offset: Int) {
    getUserApparels(limit: $limit, offset: $offset) {
      success
      message
      apparels {
        id
        userId
        category
        subcategory
        brand
        name
        status
        description
        material
        colors {
          colorname
          colorvalue
        }
        favorite
        urlRaw
        urlProcessed
        gsUtilRaw
        gsUtilProcessed
      }
      pagination {
        total
        limit
        offset
        hasMore
      }
    }
  }
`;

/**
 * GraphQL query for filtered user apparels
 */
const GET_FILTERED_USER_APPARELS_QUERY = `
  query GetFilteredUserApparels(
    $limit: Int
    $offset: Int
    $sortBy: ApparelSortOption
    $colors: [String!]
    $categories: [ApparelCategory!]
    $favorite: Boolean
  ) {
    getFilteredUserApparels(
      limit: $limit
      offset: $offset
      sortBy: $sortBy
      colors: $colors
      categories: $categories
      favorite: $favorite
    ) {
      success
      message
      apparels {
        id
        userId
        category
        subcategory
        brand
        name
        status
        description
        material
        colors {
          colorname
          colorvalue
        }
        favorite
        urlRaw
        urlProcessed
        gsUtilRaw
        gsUtilProcessed
      }
      pagination {
        total
        limit
        offset
        hasMore
      }
    }
  }
`;

interface Color {
  colorname: string;
  colorvalue: string;
}

interface Apparel {
  id: number;
  userId: number;
  category: string;
  subcategory: string;
  brand?: string;
  name?: string;
  status: string;
  description?: string;
  material: string;
  colors: Color[];
  favorite: boolean;
  urlRaw?: string;
  urlProcessed?: string;
  gsUtilRaw?: string;
  gsUtilProcessed?: string;
}

interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

interface ApparelListResponse {
  success: boolean;
  message: string;
  apparels: Apparel[];
  pagination: PaginationInfo;
}

interface GetUserApparelsResponse {
  getUserApparels?: ApparelListResponse;
  getFilteredUserApparels?: ApparelListResponse;
}

/**
 * Get user's apparel items with optional filtering
 */
export async function getUserApparels(
  args: z.infer<typeof GetUserApparelsSchema>
) {
  try {
    const { userId, category, subcategory, colors, favorite } = args;
    const userIdNum = parseInt(userId);

    // Use filtered query if any filters are provided
    const hasFilters =
      category || subcategory || colors || favorite !== undefined;

    const query = hasFilters
      ? GET_FILTERED_USER_APPARELS_QUERY
      : GET_USER_APPARELS_QUERY;

    // Build variables based on query type
    const variables: Record<string, any> = {
      limit: 50,
      offset: 0,
    };

    if (hasFilters) {
      if (category) {
        variables.categories = [category];
      }
      if (colors) {
        variables.colors = colors;
      }
      if (favorite !== undefined) {
        variables.favorite = favorite;
      }
    }

    // Pass userId for authentication
    const response = await executeQuery<GetUserApparelsResponse>(
      query,
      variables,
      userIdNum
    );

    const result = response.getUserApparels || response.getFilteredUserApparels;

    if (!result) {
      throw new Error("No response from GraphQL query");
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: result.success,
              count: result.apparels.length,
              apparels: result.apparels,
              pagination: result.pagination,
              message: result.message,
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
