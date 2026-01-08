import { z } from "zod";
import { executeQuery } from "../graphql-client.js";

/**
 * Schema for getUserProfile input
 */
export const GetUserProfileSchema = z.object({
  userId: z.string().describe("The ID of the user"),
});

/**
 * GraphQL query for user profile
 */
const GET_USER_PROFILE_QUERY = `
  query GetUserById($userId: String!) {
    getUserById(userId: $userId) {
      id
      name
      email
      height
      weight
      gender
      profileCompleted
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
  getUserById: User;
}

/**
 * Get user profile information
 */
export async function getUserProfile(
  args: z.infer<typeof GetUserProfileSchema>
) {
  try {
    const { userId } = args;

    const response = await executeQuery<GetUserResponse>(
      GET_USER_PROFILE_QUERY,
      { userId }
    );
    const user = response.getUserById;

    if (!user) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `User ${userId} not found`,
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
              user,
              message: `Retrieved profile for user ${userId}`,
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
