import express, { Request, Response } from "express";
import { config } from "./config.js";
import { AnythingAIMCPClient } from "./mcp-client.js";
import { RAGSystem } from "./rag-system.js";
import { SupervisorAgent } from "./supervisor-agent.js";

const app = express();
app.use(express.json());

// Initialize systems
let mcpClient: AnythingAIMCPClient;
let ragSystem: RAGSystem;
let supervisorAgent: SupervisorAgent;

/**
 * Authentication middleware
 */
function authenticateRequest(req: Request, res: Response, next: any) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== config.apiKey) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
}

/**
 * Health check endpoint
 */
app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "healthy",
    service: "langgraph-service",
    version: "1.0.0",
    mcpConnected: mcpClient !== null,
  });
});

/**
 * Chat endpoint - processes messages with supervisor agent
 */
app.post("/chat", authenticateRequest, async (req: Request, res: Response) => {
  try {
    const {
      message,
      userId,
      outfitId,
      rating,
      includeRating,
      imageUrl,
      conversationHistory,
    } = req.body;

    // Validate required fields
    if (!message || !userId) {
      return res.status(400).json({
        error: "Missing required fields: message, userId",
      });
    }

    console.log(
      `💬 Processing chat for user ${userId}:`,
      message.substring(0, 100),
    );

    if (conversationHistory && conversationHistory.length > 0) {
      console.log(
        `📚 Conversation history included: ${conversationHistory.length} messages`,
      );
    }

    console.log("🔄 About to call supervisorAgent.processMessage...");

    // Process with supervisor agent
    const response = await supervisorAgent.processMessage({
      message,
      userId,
      outfitId,
      rating,
      includeRating,
      imageUrl,
      conversationHistory,
    });

    console.log("✅ supervisorAgent.processMessage completed");
    console.log("📤 Response:", response?.substring(0, 100));

    res.json({
      success: true,
      output: response,
    });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Internal server error",
    });
  }
});

/**
 * Rating endpoint - processes outfit rating with suggestions
 */
app.post(
  "/rating",
  authenticateRequest,
  async (req: Request, res: Response) => {
    try {
      const { userId, outfitId, imageUrl, chatInput } = req.body;

      if (!userId || !outfitId) {
        return res.status(400).json({
          error: "Missing required fields: userId, outfitId",
        });
      }

      console.log(`⭐ Processing rating for outfit ${outfitId}`);

      // Generate rating using supervisor agent with RAG
      const ratingPrompt =
        chatInput ||
        "Rate this outfit from 1.0 to 10.0 based on fashion principles. Return only the numeric rating.";

      const response = await supervisorAgent.processMessage({
        message: ratingPrompt,
        userId,
        outfitId,
        includeRating: false,
        imageUrl,
      });

      // Extract numeric rating from response
      const ratingMatch = response.match(/(\d+\.?\d*)/);
      const rating = ratingMatch ? parseFloat(ratingMatch[1]) : 7.0;

      res.json({
        success: true,
        output: rating.toString(),
        fullResponse: response,
      });
    } catch (error) {
      console.error("Error in rating endpoint:", error);
      res.status(500).json({
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  },
);

/**
 * Initialize and start server
 */
async function startServer() {
  try {
    console.log("🚀 Starting LangGraph Service...");

    // Initialize MCP Client
    mcpClient = new AnythingAIMCPClient();
    await mcpClient.connect();

    // Initialize RAG System
    ragSystem = new RAGSystem();
    await ragSystem.initialize();

    // Initialize Supervisor Agent
    supervisorAgent = new SupervisorAgent(mcpClient, ragSystem);
    console.log("🤖 Supervisor Agent initialized");

    // Start Express server
    app.listen(config.port, () => {
      console.log(`✅ LangGraph Service running on port ${config.port}`);
      console.log(`📝 Endpoints:`);
      console.log(`   - GET  /health`);
      console.log(`   - POST /chat`);
      console.log(`   - POST /rating`);
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.log("\n👋 Shutting down gracefully...");
  if (mcpClient) {
    await mcpClient.disconnect();
  }
  process.exit(0);
});

startServer();
