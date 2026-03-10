import { GraphQLClient } from "graphql-request";
import { config } from "./config.js";
import jwt from "jsonwebtoken";

/**
 * Query to get user email by ID
 */
const GET_USER_EMAIL_QUERY = `
  query GetUserProfile {
    getUserProfile {
      success
      message
      user {
        email
      }
    }
  }
`;

/**
 * Get user email from backend for authentication
 */
async function getUserEmail(userId: number): Promise<string> {
  try {
    // First, create a temporary token to fetch user data
    const tempToken = generateAuthToken(
      userId,
      `user${userId}@temp.anythingai.app`,
    );
    const client = new GraphQLClient(config.backendGraphqlUrl, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tempToken}`,
      },
    });

    const response: any = await client.request(GET_USER_EMAIL_QUERY);
    if (
      response.getUserProfile?.success &&
      response.getUserProfile?.user?.email
    ) {
      return response.getUserProfile.user.email;
    }

    // Fallback to placeholder email if query fails
    return `user${userId}@anythingai.app`;
  } catch (error) {
    console.error("Failed to fetch user email:", error);
    // Fallback to placeholder email
    return `user${userId}@anythingai.app`;
  }
}

/**
 * Generate authentication token for a user
 */
export function generateAuthToken(userId: number, email?: string): string {
  const payload = {
    email: email || `user${userId}@anythingai.app`,
    userId,
    type: "auth",
    iat: Math.floor(Date.now() / 1000),
  };

  const secret =
    process.env.JWT_SECRET ||
    "your_jwt_secret_change_this_in_production_please";
  return jwt.sign(payload, secret);
}

/**
 * GraphQL client for backend API
 */
export const graphqlClient = new GraphQLClient(config.backendGraphqlUrl, {
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Execute GraphQL query with error handling and authentication
 */
export async function executeQuery<T>(
  query: string,
  variables?: Record<string, any>,
  userId?: number,
): Promise<T> {
  try {
    // Generate auth token if userId is provided
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (userId) {
      const token = generateAuthToken(userId);
      headers["Authorization"] = `Bearer ${token}`;
      console.log(`🔐 Generated auth token for user ${userId}`);
    }

    console.log(`📡 Executing GraphQL query to ${config.backendGraphqlUrl}`);
    console.log(`📊 Variables:`, JSON.stringify(variables, null, 2));

    // Create a new client with headers for this request
    const client = new GraphQLClient(config.backendGraphqlUrl, { headers });
    const data = await client.request<T>(query, variables);

    console.log(`✅ GraphQL query successful`);
    return data;
  } catch (error) {
    console.error("❌ GraphQL query error:", error);
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
    }
    throw new Error(`Failed to execute GraphQL query: ${error}`);
  }
}
