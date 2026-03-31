import axios from "axios";
import FormData from "form-data";
import { randomUUID } from "crypto";
import { redisConnection } from "../queues/redis";
import { Outfit } from "../models/outfit.model";

/**
 * Service for outfit chat functionality with N8N webhooks
 */

interface ChatSession {
  sessionId: string;
  outfitId: number;
  userId: string;
  includeRating: boolean;
  createdAt: number;
  imageUrlUsed: string; // Store the image URL used in this session
  messageCount: number; // Track number of messages sent
}

interface CreateChatSessionInput {
  outfitId: number;
  userId: string;
  includeRating: boolean;
}

interface SendChatMessageInput {
  sessionId: string;
  chatInput: string;
}

interface ChatResponse {
  output: string;
}

// Redis key prefix for chat sessions
const CHAT_SESSION_PREFIX = "chat:session:";
const SESSION_TTL = 3600; // 1 hour in seconds (can be adjusted)

/**
 * Create a new chat session
 */
export async function createChatSession(
  input: CreateChatSessionInput,
): Promise<ChatSession> {
  try {
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
    let imageUrl: string;

    if (outfit.imageList && typeof outfit.imageList === "object") {
      const imageList = outfit.imageList as { [key: string]: string };
      // Prefer the 90-degree (front-facing) image, fallback to primary
      imageUrl = imageList["90"] || outfit.primaryImageUrl || "";
    } else {
      imageUrl = outfit.primaryImageUrl || "";
    }

    if (!imageUrl) {
      throw new Error(`No image available for outfit ${input.outfitId}`);
    }

    // Generate unique session ID
    const sessionId = `outfit-chat-${input.outfitId}-${randomUUID()}`;

    // Create session object
    const session: ChatSession = {
      sessionId,
      outfitId: input.outfitId,
      userId: input.userId,
      includeRating: input.includeRating,
      createdAt: Date.now(),
      imageUrlUsed: imageUrl,
      messageCount: 0,
    };

    // Store in Redis with TTL
    const redisKey = `${CHAT_SESSION_PREFIX}${sessionId}`;
    await redisConnection.setex(redisKey, SESSION_TTL, JSON.stringify(session));

    console.log(
      `✅ Created chat session: ${sessionId} for outfit ${input.outfitId}`,
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
 * Update chat session in Redis (used to increment message count)
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
 * Download image and prepare for webhook
 */
async function downloadImageAsBuffer(imageUrl: string): Promise<Buffer> {
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 30000, // 30 second timeout
  });
  return Buffer.from(response.data);
}

/**
 * Call N8N chat webhook with rating
 */
async function callChatWithRatingWebhook(
  sessionId: string,
  chatInput: string,
  imageBuffer: Buffer | null,
  rating: number,
  isFirstMessage: boolean,
): Promise<string> {
  try {
    const webhookUrl =
      process.env.N8N_CHAT_WITH_RATING_WEBHOOK_URL ||
      "http://localhost:5678/webhook/chatWithRating";

    console.log(
      `💬 Calling chat WITH rating webhook for session: ${sessionId} (first message: ${isFirstMessage})`,
    );

    // Create form data
    const formData = new FormData();
    formData.append("sessionId", sessionId);
    formData.append("chatInput", chatInput);

    // Only send image on first message
    if (isFirstMessage && imageBuffer) {
      formData.append("image", imageBuffer, {
        filename: "outfit.jpg",
        contentType: "image/jpeg",
      });
    }

    formData.append("rating", rating.toString());

    // Make the request
    const response = await axios.post<ChatResponse>(webhookUrl, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 60000, // 60 second timeout
    });

    console.log(
      `✅ Chat webhook response received (length: ${response.data.output.length} chars)`,
    );

    return response.data.output;
  } catch (error) {
    console.error("❌ Error calling chat with rating webhook:", error);
    if (axios.isAxiosError(error)) {
      console.error("Response data:", error.response?.data);
      console.error("Response status:", error.response?.status);
    }
    throw error;
  }
}

/**
 * Call N8N chat webhook without rating
 */
async function callChatWithoutRatingWebhook(
  sessionId: string,
  chatInput: string,
  imageBuffer: Buffer | null,
  isFirstMessage: boolean,
): Promise<string> {
  try {
    const webhookUrl =
      process.env.N8N_CHAT_WITHOUT_RATING_WEBHOOK_URL ||
      "http://localhost:5678/webhook/chatWithoutRating";

    console.log(
      `💬 Calling chat WITHOUT rating webhook for session: ${sessionId} (first message: ${isFirstMessage})`,
    );

    // Create form data
    const formData = new FormData();
    formData.append("sessionId", sessionId);
    formData.append("chatInput", chatInput);

    // Only send image on first message
    if (isFirstMessage && imageBuffer) {
      formData.append("image", imageBuffer, {
        filename: "outfit.jpg",
        contentType: "image/jpeg",
      });
    }

    // Make the request
    const response = await axios.post<ChatResponse>(webhookUrl, formData, {
      headers: {
        ...formData.getHeaders(),
      },
      timeout: 60000, // 60 second timeout
    });

    console.log(
      `✅ Chat webhook response received (length: ${response.data.output.length} chars)`,
    );

    return response.data.output;
  } catch (error) {
    console.error("❌ Error calling chat without rating webhook:", error);
    if (axios.isAxiosError(error)) {
      console.error("Response data:", error.response?.data);
      console.error("Response status:", error.response?.status);
    }
    throw error;
  }
}

/**
 * Send a chat message and get response from N8N
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

    // Check if this is the first message
    const isFirstMessage = session.messageCount === 0;

    // Get outfit details (only needed for rating or first message)
    const outfit = await Outfit.findOne({
      where: { id: session.outfitId },
    });

    if (!outfit) {
      throw new Error(`Outfit ${session.outfitId} not found`);
    }

    // Download image only on first message
    let imageBuffer: Buffer | null = null;

    if (isFirstMessage) {
      console.log(
        `📸 First message - downloading image for outfit ${
          session.outfitId
        }: ${session.imageUrlUsed.substring(0, 50)}...`,
      );
      imageBuffer = await downloadImageAsBuffer(session.imageUrlUsed);
    } else {
      console.log(
        `💬 Follow-up message ${
          session.messageCount + 1
        } - skipping image download, using chat history`,
      );
    }

    // Call appropriate webhook based on includeRating flag
    let response: string;

    if (session.includeRating) {
      // Check if rating exists
      if (!outfit.rating) {
        throw new Error(
          `Outfit ${session.outfitId} does not have a rating. Please generate angles first or use chat without rating.`,
        );
      }

      response = await callChatWithRatingWebhook(
        input.sessionId,
        input.chatInput,
        imageBuffer,
        outfit.rating,
        isFirstMessage,
      );
    } else {
      response = await callChatWithoutRatingWebhook(
        input.sessionId,
        input.chatInput,
        imageBuffer,
        isFirstMessage,
      );
    }

    // Increment message count and update session
    session.messageCount += 1;
    await updateChatSession(session);

    return response;
  } catch (error) {
    console.error("❌ Error sending chat message:", error);
    throw error;
  }
}

/**
 * Delete a chat session (optional - for cleanup)
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
 * Get all active sessions for a user (optional - for debugging)
 */
export async function getUserActiveSessions(
  userId: string,
): Promise<ChatSession[]> {
  try {
    // Scan for all chat session keys
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
