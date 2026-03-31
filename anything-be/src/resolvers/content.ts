import { getUserFromToken } from "../helpers/utils";
import { AppDocument, ChatStarter } from "../models/index";

const contentResolvers = {
  Query: {
    getChatStarters: async (_: any, __: any, context: any) => {
      try {
        // Extract token from Authorization header for authentication
        const authHeader = context.req?.headers?.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          throw new Error(
            "Authentication required. Please provide a valid token."
          );
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const userFromToken = await getUserFromToken(token);

        if (!userFromToken) {
          throw new Error("Invalid or expired token");
        }

        console.log(
          `🎯 Fetching chat starters for user: ${userFromToken.userId}`
        );

        // Fetch active chat starters ordered by sortOrder
        const chatStarters = await ChatStarter.findAll({
          where: {
            isActive: true,
          },
          order: [["sortOrder", "ASC"]],
          attributes: ["message"], // Only get the message field
        });

        // Transform to the expected format
        const starters = chatStarters.map((starter) => ({
          question: starter.message,
        }));

        console.log(`Retrieved ${starters.length} chat starters`);

        return {
          starters,
        };
      } catch (error) {
        console.error("Error in getChatStarters:", error);
        throw new Error(
          `Error retrieving chat starters: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    },

    getAppDocument: async (
      _: any,
      { type }: { type: string },
      context: any
    ) => {
      try {
        // Extract token from Authorization header for authentication
        const authHeader = context.req?.headers?.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          throw new Error(
            "Authentication required. Please provide a valid token."
          );
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const userFromToken = await getUserFromToken(token);

        if (!userFromToken) {
          throw new Error("Invalid or expired token");
        }

        // Validate document type
        if (!type || typeof type !== "string") {
          throw new Error("Document type is required and must be a string");
        }

        // Validate that the type is one of the allowed values
        const allowedTypes = ["termsAndConditions", "privacyPolicy"];
        if (!allowedTypes.includes(type)) {
          throw new Error(
            `Invalid document type. Must be one of: ${allowedTypes.join(", ")}`
          );
        }

        console.log(
          `🎯 Fetching app document for type: ${type}, user: ${userFromToken.userId}`
        );

        // Fetch the document by type
        const appDocument = await AppDocument.findOne({
          where: {
            type: type,
            isActive: true,
          },
        });

        if (!appDocument) {
          throw new Error(`Document not found for type: ${type}`);
        }

        console.log(`Retrieved app document: ${type} -> ${appDocument.url}`);

        return {
          type: appDocument.type,
          url: appDocument.url,
        };
      } catch (error) {
        console.error("Error in getAppDocument:", error);
        throw new Error(
          `Error retrieving app document: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    },
  },
};

export default contentResolvers;
