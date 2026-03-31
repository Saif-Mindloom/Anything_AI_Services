import {
  createChatSession,
  sendChatMessage,
  getChatSession,
  deleteChatSession,
} from "../services/outfitChatService";

/**
 * GraphQL Resolvers for Outfit Chat functionality
 */

interface CreateChatSessionInput {
  outfitId?: number;
  includeRating: boolean;
}

interface SendChatMessageInput {
  sessionId: string;
  chatInput: string;
}

export const outfitChatResolvers = {
  Query: {
    /**
     * Get a chat session by ID
     */
    getChatSession: async (
      _: any,
      { sessionId }: { sessionId: string },
      context: any,
    ) => {
      try {
        // Verify user is authenticated
        if (!context.user?.userId) {
          throw new Error("Authentication required");
        }

        const session = await getChatSession(sessionId);

        if (!session) {
          return null;
        }

        // Verify user owns the session
        if (session.userId !== context.user?.userId) {
          throw new Error("Unauthorized: This session belongs to another user");
        }

        return session;
      } catch (error: any) {
        console.error("Error getting chat session:", error);
        throw error;
      }
    },
  },

  Mutation: {
    /**
     * Create a new chat session for an outfit
     */
    createChatSession: async (
      _: any,
      { input }: { input: CreateChatSessionInput },
      context: any,
    ) => {
      try {
        // Verify user is authenticated
        if (!context.user?.userId) {
          return {
            success: false,
            message: "Authentication required",
            session: null,
          };
        }

        console.log(
          `📝 Creating chat session${input.outfitId ? ` for outfit ${input.outfitId}` : " (general chat)"}, includeRating: ${input.includeRating}`,
        );

        const session = await createChatSession({
          outfitId: input.outfitId,
          userId: context.user?.userId,
          includeRating: input.includeRating,
        });

        return {
          success: true,
          message: "Chat session created successfully",
          session,
        };
      } catch (error: any) {
        console.error("Error creating chat session:", error);
        return {
          success: false,
          message: error.message || "Failed to create chat session",
          session: null,
        };
      }
    },

    /**
     * Send a message in a chat session
     */
    sendChatMessage: async (
      _: any,
      { input }: { input: SendChatMessageInput },
      context: any,
    ) => {
      try {
        // Verify user is authenticated
        if (!context.user?.userId) {
          return {
            success: false,
            message: "Authentication required",
            response: null,
            sessionId: input.sessionId,
          };
        }

        // Verify session belongs to user
        const session = await getChatSession(input.sessionId);

        if (!session) {
          return {
            success: false,
            message:
              "Chat session not found or expired. Please create a new session.",
            response: null,
            sessionId: input.sessionId,
          };
        }

        if (session.userId !== context.user?.userId) {
          return {
            success: false,
            message: "Unauthorized: This session belongs to another user",
            response: null,
            sessionId: input.sessionId,
          };
        }

        console.log(
          `💬 Sending chat message for session ${input.sessionId}: "${input.chatInput.substring(0, 50)}..."`,
        );

        const response = await sendChatMessage({
          sessionId: input.sessionId,
          chatInput: input.chatInput,
        });

        return {
          success: true,
          message: "Message sent successfully",
          response,
          sessionId: input.sessionId,
        };
      } catch (error: any) {
        console.error("Error sending chat message:", error);
        return {
          success: false,
          message: error.message || "Failed to send message",
          response: null,
          sessionId: input.sessionId,
        };
      }
    },

    /**
     * End a chat session (optional - sessions auto-expire)
     */
    endChatSession: async (
      _: any,
      { sessionId }: { sessionId: string },
      context: any,
    ) => {
      try {
        // Verify user is authenticated
        if (!context.user?.userId) {
          throw new Error("Authentication required");
        }

        // Verify session belongs to user
        const session = await getChatSession(sessionId);

        if (!session) {
          // Session already expired or doesn't exist
          return true;
        }

        if (session.userId !== context.user?.userId) {
          throw new Error("Unauthorized: This session belongs to another user");
        }

        await deleteChatSession(sessionId);

        console.log(`🏁 Ended chat session: ${sessionId}`);

        return true;
      } catch (error: any) {
        console.error("Error ending chat session:", error);
        throw error;
      }
    },
  },
};
