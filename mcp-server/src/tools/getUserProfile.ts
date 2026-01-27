import { z } from "zod";
import { executeQuery } from "../graphql-client.js";

/**
 * Schema for getUserProfile input
 */
export const GetUserProfileSchema = z.object({
  userId: z
    .union([z.string(), z.number()])
    .transform(Number)
    .describe("The ID of the user"),
});

/**
 * GraphQL query for user profile
 */
const GET_USER_PROFILE_QUERY = `
  query GetUserProfileDetailsForMCP($userId: Int!) {
    getUserProfileDetailsForMCP(userId: $userId) {
      status
      name
      age
      mainLandingImage
      wardrobeDetails {
        looksCount
        maxlimitApparels
        itemsCount
      }
    }
  }
`;

interface User {
  id: number;
  name: string;
  email: string;
  height: number;
  weight: number;
  gender?: string;
  profileCompleted: boolean;
}

interface GetUserResponse {
  getUserProfileDetails: User;
}

/**
 * Get user profile information
 */
export async function getUserProfile(
  args: z.infer<typeof GetUserProfileSchema>
) {
  try {
    const { userId } = args;

    const response = await executeQuery<any>(GET_USER_PROFILE_QUERY, {
      userId,
    });

    const profileData = response.getUserProfileDetailsForMCP;

    if (!profileData) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: "Unable to retrieve user profile",
            }),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              success: true,
              user: {
                name: profileData.name,
                age: profileData.age,
                wardrobeCount: profileData.wardrobeDetails?.itemsCount || 0,
                looksCount: profileData.wardrobeDetails?.looksCount || 0,
                maxApparels: profileData.wardrobeDetails?.maxlimitApparels || 0,
              },
              message: `Retrieved profile for user: ${profileData.name}`,
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
