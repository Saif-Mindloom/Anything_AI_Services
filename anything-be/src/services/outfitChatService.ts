import { randomUUID } from "crypto";
import { redisConnection } from "../queues/redis";
import { Outfit } from "../models/outfit.model";
import { callChatService } from "./langGraphService";

/**
 * Service for outfit chat functionality with LangGraph AI
 * Uses LangGraph service directly instead of n8n webhooks
 */

interface ChatSession {
  sessionId: string;
  outfitId?: number;
  userId: string;
  includeRating: boolean;
  createdAt: number;
  imageUrlUsed?: string;
  messageCount: number;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: number;
  }>;
}

interface CreateChatSessionInput {
  outfitId?: number;
  userId: string;
  includeRating: boolean;
}

interface SendChatMessageInput {
  sessionId: string;
  chatInput: string;
}

// Redis key prefix for chat sessions
const CHAT_SESSION_PREFIX = "chat:session:";
const SESSION_TTL = 3600; // 1 hour in seconds

/**
 * Create a new chat session
 */
export async function createChatSession(
  input: CreateChatSessionInput,
): Promise<ChatSession> {
  try {
    let imageUrl: string | undefined = undefined;

    // If outfitId is provided, verify and fetch outfit details
    if (input.outfitId) {
      // Verify outfit exists
      const outfit = await Outfit.findOne({
        where: { id: input.outfitId },
      });

      if (!outfit) {
        throw new Error(`Outfit ${input.outfitId} not found`);
      }

      // Verify user owns the outfit
      if (outfit.userId !== parseInt(input.userId)) {
        throw new Error(
          `User ${input.userId} does not own outfit ${input.outfitId}`,
        );
      }

      // Get the best image for the outfit
      if (outfit.imageList && typeof outfit.imageList === "object") {
        const imageList = outfit.imageList as { [key: string]: string };
        // Prefer the 90-degree (front-facing) image, fallback to primary
        imageUrl = imageList["90"] || outfit.primaryImageUrl || undefined;
      } else {
        imageUrl = outfit.primaryImageUrl || undefined;
      }

      if (!imageUrl) {
        throw new Error(`No image available for outfit ${input.outfitId}`);
      }
    }

    // Generate unique session ID
    const sessionId = input.outfitId
      ? `outfit-chat-${input.outfitId}-${randomUUID()}`
      : `general-chat-${randomUUID()}`;

    // Create session object
    const session: ChatSession = {
      sessionId,
      outfitId: input.outfitId ? Number(input.outfitId) : undefined,
      userId: input.userId,
      includeRating: input.includeRating,
      createdAt: Date.now(),
      imageUrlUsed: imageUrl,
      messageCount: 0,
      conversationHistory: [],
    };

    // Store in Redis with TTL
    const redisKey = `${CHAT_SESSION_PREFIX}${sessionId}`;
    await redisConnection.setex(redisKey, SESSION_TTL, JSON.stringify(session));

    console.log(
      `✅ Created chat session: ${sessionId}${input.outfitId ? ` for outfit ${input.outfitId}` : " (general chat)"}`,
    );

    return session;
  } catch (error) {
    console.error("❌ Error creating chat session:", error);
    throw error;
  }
}

/**
 * Get chat session from Redis
 */
export async function getChatSession(
  sessionId: string,
): Promise<ChatSession | null> {
  try {
    const redisKey = `${CHAT_SESSION_PREFIX}${sessionId}`;
    const sessionData = await redisConnection.get(redisKey);

    if (!sessionData) {
      return null;
    }

    // Refresh TTL on access (sliding expiration)
    await redisConnection.expire(redisKey, SESSION_TTL);

    return JSON.parse(sessionData) as ChatSession;
  } catch (error) {
    console.error("❌ Error getting chat session:", error);
    throw error;
  }
}

/**
 * Update chat session in Redis
 */
async function updateChatSession(session: ChatSession): Promise<void> {
  try {
    const redisKey = `${CHAT_SESSION_PREFIX}${session.sessionId}`;
    await redisConnection.setex(redisKey, SESSION_TTL, JSON.stringify(session));
  } catch (error) {
    console.error("❌ Error updating chat session:", error);
    throw error;
  }
}

/**
 * Call LangGraph service for AI response
 */
async function callLangGraphService(
  session: ChatSession,
  chatInput: string,
  outfit: any,
): Promise<string> {
  try {
    console.log(
      `🤖 Calling LangGraph for session: ${session.sessionId} (message ${
        session.messageCount + 1
      })`,
    );

    // Prepare request payload
    const payload: any = {
      message: chatInput,
      userId: session.userId,
      outfitId: session.outfitId, // Can be undefined for general chat
      includeRating: session.includeRating,
      imageUrl: session.imageUrlUsed, // Can be undefined for general chat
      conversationHistory: session.conversationHistory,
    };

    // Add rating if available and requested
    if (session.includeRating && outfit && outfit.rating) {
      payload.rating = outfit.rating;
    }

    // Call LangGraph service via the new langGraphService
    const response = await callChatService(payload);

    console.log(
      `✅ LangGraph response received (length: ${response.length} chars)`,
    );

    return response;
  } catch (error) {
    console.error("❌ Error calling LangGraph service:", error);
    throw new Error("Failed to get AI response. Please try again.");
  }
}

/**
 * Send a chat message and get AI response
 */
export async function sendChatMessage(
  input: SendChatMessageInput,
): Promise<string> {
  try {
    // Get session from Redis
    const session = await getChatSession(input.sessionId);

    if (!session) {
      throw new Error(
        `Chat session ${input.sessionId} not found or expired. Please create a new chat session.`,
      );
    }

    // Get outfit details if outfitId is provided
    let outfit = null;
    if (session.outfitId) {
      outfit = await Outfit.findOne({
        where: { id: session.outfitId },
      });

      if (!outfit) {
        throw new Error(`Outfit ${session.outfitId} not found`);
      }

      // Validate rating if needed
      if (session.includeRating && !outfit.rating) {
        throw new Error(
          `Outfit ${session.outfitId} does not have a rating. Please generate angles first or use chat without rating.`,
        );
      }
    }

    // Call LangGraph service (it handles image analysis via URL)
    // Pass conversation history WITHOUT the current message
    const response = await callLangGraphService(
      session,
      input.chatInput,
      outfit,
    );

    // Add user message to conversation history AFTER getting response
    session.conversationHistory.push({
      role: "user",
      content: input.chatInput,
      timestamp: Date.now(),
    });

    // Add AI response to conversation history
    session.conversationHistory.push({
      role: "assistant",
      content: response,
      timestamp: Date.now(),
    });

    // Increment message count and update session
    session.messageCount += 1;
    await updateChatSession(session);

    console.log(
      `💾 Updated session with conversation history (${session.conversationHistory.length} messages)`,
    );

    return response;
  } catch (error) {
    console.error("❌ Error sending chat message:", error);
    throw error;
  }
}

/**
 * Delete a chat session
 */
export async function deleteChatSession(sessionId: string): Promise<void> {
  try {
    const redisKey = `${CHAT_SESSION_PREFIX}${sessionId}`;
    await redisConnection.del(redisKey);
    console.log(`🗑️  Deleted chat session: ${sessionId}`);
  } catch (error) {
    console.error("❌ Error deleting chat session:", error);
    throw error;
  }
}

/**
 * Get all active sessions for a user
 */
export async function getUserActiveSessions(
  userId: string,
): Promise<ChatSession[]> {
  try {
    const pattern = `${CHAT_SESSION_PREFIX}*`;
    const keys = await redisConnection.keys(pattern);

    const sessions: ChatSession[] = [];

    for (const key of keys) {
      const sessionData = await redisConnection.get(key);
      if (sessionData) {
        const session = JSON.parse(sessionData) as ChatSession;
        if (session.userId === userId) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  } catch (error) {
    console.error("❌ Error getting user active sessions:", error);
    throw error;
  }
}
