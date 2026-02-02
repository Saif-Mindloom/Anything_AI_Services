import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, END, START, Annotation } from "@langchain/langgraph";
import {
  BaseMessage,
  HumanMessage,
  AIMessage,
  SystemMessage,
} from "@langchain/core/messages";
import { config } from "./config.js";
import { AnythingAIMCPClient } from "./mcp-client.js";
import { RAGSystem } from "./rag-system.js";

/**
 * Agent State using Annotation API
 */
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (left, right) => (left || []).concat(right || []),
    default: () => [],
  }),
  userId: Annotation<string>({
    reducer: (left, right) => right ?? left,
    default: () => "",
  }),
  outfitId: Annotation<number | undefined>({
    reducer: (left, right) => right ?? left,
  }),
  rating: Annotation<number | undefined>({
    reducer: (left, right) => right ?? left,
  }),
  includeRating: Annotation<boolean | undefined>({
    reducer: (left, right) => right ?? left,
  }),
  imageUrl: Annotation<string | undefined>({
    reducer: (left, right) => right ?? left,
  }),
  conversationHistory: Annotation<
    | Array<{ role: "user" | "assistant"; content: string; timestamp: number }>
    | undefined
  >({
    reducer: (left, right) => right ?? left,
    default: () => [],
  }),
  nextStep: Annotation<"mcp" | "rag" | "both" | "respond">({
    reducer: (left, right) => right ?? left,
    default: () => "respond" as const,
  }),
  mcpResults: Annotation<string | undefined>({
    reducer: (left, right) => right ?? left,
  }),
  ragResults: Annotation<string | undefined>({
    reducer: (left, right) => right ?? left,
  }),
  finalResponse: Annotation<string | undefined>({
    reducer: (left, right) => right ?? left,
  }),
});

type AgentStateType = typeof AgentState.State;

/**
 * Supervisor Agent with LangGraph
 * Routes between MCP tools (user data) and RAG (fashion knowledge)
 */
export class SupervisorAgent {
  private llm: ChatOpenAI;
  private mcpClient: AnythingAIMCPClient;
  private ragSystem: RAGSystem;
  private graph: any;

  constructor(mcpClient: AnythingAIMCPClient, ragSystem: RAGSystem) {
    this.llm = new ChatOpenAI({
      openAIApiKey: config.openaiApiKey,
      modelName: "gpt-4o",
      temperature: 0.7,
    });

    this.mcpClient = mcpClient;
    this.ragSystem = ragSystem;
    this.buildGraph();
  }

  /**
   * Build the supervisor agent graph
   */
  private buildGraph() {
    const workflow = new StateGraph(AgentState)
      // Add nodes
      .addNode("supervisor", this.supervisorNode.bind(this))
      .addNode("mcp_agent", this.mcpAgentNode.bind(this))
      .addNode("rag_agent", this.ragAgentNode.bind(this))
      .addNode("responder", this.responderNode.bind(this))
      // Add edges
      .addEdge(START, "supervisor")
      .addConditionalEdges("supervisor", (state: AgentStateType) => {
        const decision = this.routeDecision(state);
        console.log(`🎯 Route decision: ${decision}`);

        // Map the decision to actual node names
        const routeMap: Record<string, string> = {
          mcp: "mcp_agent",
          rag: "rag_agent",
          both: "mcp_agent",
          respond: "responder",
        };

        const targetNode = routeMap[decision] || "responder";
        console.log(`➡️  Routing to: ${targetNode}`);
        return targetNode;
      })
      .addEdge("mcp_agent", "supervisor")
      .addEdge("rag_agent", "responder")
      .addEdge("responder", END);

    this.graph = workflow.compile();
  }

  /**
   * Supervisor Node - Decides which agent to call
   */
  private async supervisorNode(
    state: AgentStateType,
  ): Promise<Partial<AgentStateType>> {
    console.log("\n🧠 === SUPERVISOR NODE ===");
    const lastMessage = state.messages[state.messages.length - 1];
    const userQuery = lastMessage.content.toString().toLowerCase();
    console.log("📝 User query:", userQuery);
    console.log("📊 Already have MCP results:", !!state.mcpResults);
    console.log("📚 Already have RAG results:", !!state.ragResults);

    // If we already have results, go to responder
    if (state.mcpResults || state.ragResults) {
      console.log("✅ Results already gathered, routing to responder");
      console.log("🧠 === SUPERVISOR NODE COMPLETE ===\n");
      return { nextStep: "respond" };
    }

    // Check for simple greetings/conversational queries
    const isGreeting =
      /^(hi|hey|hello|hola|good morning|good afternoon|good evening|greetings|sup|what's up|whats up|yo)\s*[!.?]*$/i.test(
        userQuery.trim(),
      );
    const isShortConversational =
      userQuery.trim().length < 30 &&
      (userQuery.includes("how are you") ||
        userQuery.includes("how r u") ||
        userQuery.includes("thank") ||
        userQuery.includes("cool") ||
        userQuery.includes("nice") ||
        userQuery.includes("ok") ||
        userQuery.includes("okay"));

    if (isGreeting || isShortConversational) {
      console.log(
        "✅ Simple greeting/conversational message detected, responding directly",
      );
      console.log("🧠 === SUPERVISOR NODE COMPLETE ===\n");
      return { nextStep: "respond" };
    }

    // Decision logic
    let nextStep: "mcp" | "rag" | "both" | "respond" = "respond";

    // Check for outfit recommendation queries (should I wear, what to wear, suggest outfit)
    const isOutfitRecommendation =
      userQuery.includes("what should i wear") ||
      userQuery.includes("what to wear") ||
      userQuery.includes("recommend outfit") ||
      userQuery.includes("suggest outfit") ||
      userQuery.includes("outfit for") ||
      userQuery.includes("should i wear") ||
      (userQuery.includes("wear") &&
        (userQuery.includes("tomorrow") ||
          userQuery.includes("today") ||
          userQuery.includes("tonight") ||
          userQuery.includes("this evening")));

    // Check if we need MCP (user data queries, weather, occasions)
    const needsMCP =
      isOutfitRecommendation || // Outfit recommendations always need user data
      userQuery.includes("wardrobe") ||
      userQuery.includes("apparel") ||
      userQuery.includes("outfit") ||
      userQuery.includes("suggest") ||
      userQuery.includes("improve") ||
      userQuery.includes("alternative") ||
      userQuery.includes("low rating") ||
      userQuery.includes("my clothes") ||
      userQuery.includes("weather") ||
      userQuery.includes("forecast") ||
      userQuery.includes("temperature") ||
      userQuery.includes("rain") ||
      userQuery.includes("occasion") ||
      userQuery.includes("holiday") ||
      userQuery.includes("festival") ||
      userQuery.includes("diwali") ||
      userQuery.includes("eid") ||
      userQuery.includes("christmas") ||
      userQuery.includes("holi") ||
      (state.rating !== undefined && state.rating < 7);

    // Check if we need RAG (fashion knowledge queries)
    const needsRAG =
      isOutfitRecommendation || // Outfit recommendations benefit from fashion knowledge
      userQuery.includes("style") ||
      userQuery.includes("fashion") ||
      userQuery.includes("occasion") ||
      userQuery.includes("color") ||
      userQuery.includes("coordination") ||
      userQuery.includes("appropriate") ||
      userQuery.includes("rule") ||
      userQuery.includes("principle") ||
      userQuery.includes("advice");

    console.log("🔍 Analysis - needsMCP:", needsMCP, "needsRAG:", needsRAG);

    if (needsMCP && needsRAG) {
      nextStep = "both";
    } else if (needsMCP) {
      nextStep = "mcp";
    } else if (needsRAG) {
      nextStep = "rag";
    }

    console.log(`🎯 Supervisor Decision: ${nextStep}`);
    console.log("🧠 === SUPERVISOR NODE COMPLETE ===\n");

    return { nextStep };
  }

  /**
   * Route Decision
   */
  private routeDecision(state: AgentStateType): string {
    console.log("\n🔀 === ROUTE DECISION ===");
    console.log("📊 MCP Results present:", !!state.mcpResults);
    console.log("📚 RAG Results present:", !!state.ragResults);
    console.log("🎯 Next step:", state.nextStep);

    let decision: string;
    // If nextStep is undefined, we've completed a task and should respond
    if (!state.nextStep) {
      decision = "respond";
    } else if (
      state.mcpResults &&
      !state.ragResults &&
      state.nextStep === "both"
    ) {
      decision = "rag";
    } else {
      decision = state.nextStep;
    }

    console.log("🔀 Decision:", decision);
    console.log("🔀 === ROUTE DECISION COMPLETE ===\n");
    return decision;
  }

  /**
   * MCP Agent Node - Queries user data via MCP tools
   */
  private async mcpAgentNode(
    state: AgentStateType,
  ): Promise<Partial<AgentStateType>> {
    try {
      console.log("\n🔧 === MCP AGENT NODE ===");
      console.log("📝 State keys:", Object.keys(state));
      const userQuery =
        state.messages[state.messages.length - 1].content.toString();
      console.log("📝 Query:", userQuery);

      // Create a specialized LLM with MCP tools
      const mcpTools = this.mcpClient.getLangChainTools();
      const llmWithTools = this.llm.bindTools(mcpTools);

      // Detect query type for smart tool selection
      const isOutfitRecommendation =
        userQuery.toLowerCase().includes("what should i wear") ||
        userQuery.toLowerCase().includes("what to wear") ||
        userQuery.toLowerCase().includes("recommend outfit") ||
        (userQuery.toLowerCase().includes("wear") &&
          (userQuery.toLowerCase().includes("tomorrow") ||
            userQuery.toLowerCase().includes("today")));

      // Create analysis prompt
      const systemPrompt = `You are a fashion data analyst with access to user wardrobe data.
      
Available tools:
- get_user_apparels: Get user's clothing items (wardrobe)
- get_outfit_details: Get specific outfit information  
- get_user_profile: Get user profile and preferences
- suggest_apparels: Suggest alternative items to improve outfit
- get_weather_forecast: Get weather forecast (temperature, conditions, rain probability)
- get_occasions: Get upcoming holidays/occasions (festivals, special days)

User ID: ${state.userId}
${state.outfitId ? `Outfit ID: ${state.outfitId}` : ""}
${state.rating ? `Current Rating: ${state.rating}/10` : ""}

${
  isOutfitRecommendation
    ? `
CRITICAL: For outfit recommendation queries, you ABSOLUTELY MUST gather wardrobe data:

REQUIRED TOOL CALLS (in this order):
1. Call get_weather_forecast - REQUIRED to understand weather conditions
2. Call get_occasions - REQUIRED to check for special events
3. Call get_user_apparels - REQUIRED to see user's available clothing items
4. Optionally call get_user_profile - for user preferences

IMPORTANT: You MUST call get_user_apparels regardless of anything else. The user cannot get outfit suggestions without knowing their wardrobe.

After gathering ALL this data, provide personalized suggestions based on:
- Weather conditions
- Special occasions/festivals
- User's actual available clothing items
- User preferences

The user is asking what to wear TODAY - gather complete context from their actual wardrobe!`
    : "Analyze the query and use the appropriate tools to gather relevant user data."
}

Query: ${userQuery}`;

      const response = await llmWithTools.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userQuery),
      ]);

      // Execute tool calls if any
      let mcpResults = "No specific user data retrieved.";
      console.log(
        "🔍 Checking for tool calls:",
        response.tool_calls?.length || 0,
      );

      if (response.tool_calls && response.tool_calls.length > 0) {
        console.log("🛠️  Executing", response.tool_calls.length, "tool(s)");
        const toolResults = await Promise.all(
          response.tool_calls.map(async (toolCall) => {
            console.log("🔧 Calling tool:", toolCall.name);
            const tool = mcpTools.find((t) => t.name === toolCall.name);
            if (tool) {
              try {
                const result = await tool.invoke(toolCall.args);
                console.log("✅ Tool", toolCall.name, "succeeded");
                return `[${toolCall.name}]\n${result}`;
              } catch (error) {
                console.log("❌ Tool", toolCall.name, "failed:", error);
                return `[${toolCall.name}] Error: ${error}`;
              }
            }
            return "";
          }),
        );
        mcpResults = toolResults.join("\n\n");
      }

      console.log("📊 MCP Results length:", mcpResults.length);
      console.log("🔧 === MCP AGENT NODE COMPLETE ===\n");

      return { mcpResults, nextStep: undefined };
    } catch (error) {
      console.error("❌ Error in MCP agent:", error);
      console.error(
        "❌ Error stack:",
        error instanceof Error ? error.stack : "N/A",
      );
      // Return error but clear nextStep to prevent infinite loop
      return { mcpResults: `Error: ${error}`, nextStep: undefined };
    }
  }

  /**
   * RAG Agent Node - Queries fashion knowledge base
   */
  private async ragAgentNode(
    state: AgentStateType,
  ): Promise<Partial<AgentStateType>> {
    try {
      console.log("\n📚 === RAG AGENT NODE ===");
      const userQuery =
        state.messages[state.messages.length - 1].content.toString();
      console.log("📝 Query:", userQuery);

      // Search fashion knowledge base
      const ragResults = await this.ragSystem.getFashionAdvice(userQuery);

      console.log("📚 RAG Results length:", ragResults?.length || 0);
      console.log("📚 === RAG AGENT NODE COMPLETE ===\n");

      return { ragResults };
    } catch (error) {
      console.error("Error in RAG agent:", error);
      return { ragResults: `Error: ${error}` };
    }
  }

  /**
   * Responder Node - Generates final response
   */
  private async responderNode(
    state: AgentStateType,
  ): Promise<Partial<AgentStateType>> {
    try {
      console.log("\n💬 === RESPONDER NODE ===");
      console.log("📦 State keys:", Object.keys(state));
      console.log("📊 MCP Results present:", !!state.mcpResults);
      console.log("📚 RAG Results present:", !!state.ragResults);

      const userQuery =
        state.messages[state.messages.length - 1].content.toString();
      console.log("📝 Query:", userQuery);

      // Detect if this is an outfit recommendation query
      const isOutfitRecommendation =
        userQuery.toLowerCase().includes("what should i wear") ||
        userQuery.toLowerCase().includes("what to wear") ||
        userQuery.toLowerCase().includes("recommend outfit") ||
        (userQuery.toLowerCase().includes("wear") &&
          (userQuery.toLowerCase().includes("tomorrow") ||
            userQuery.toLowerCase().includes("today") ||
            userQuery.toLowerCase().includes("tonight")));

      // Build context from MCP and RAG results
      let contextParts: string[] = [];

      if (state.mcpResults) {
        contextParts.push(`USER DATA:\n${state.mcpResults}`);
      }

      if (state.ragResults) {
        contextParts.push(`FASHION KNOWLEDGE:\n${state.ragResults}`);
      }

      const context = contextParts.join("\n\n---\n\n");

      // Build conversation history context if available
      let conversationContext = "";
      if (state.conversationHistory && state.conversationHistory.length > 0) {
        console.log(
          `📜 Including ${state.conversationHistory.length} previous messages in context`,
        );
        conversationContext = `\n\n🔴 CRITICAL: This is an ONGOING conversation with ${state.conversationHistory.length} previous messages. You MUST reference and recall previous messages when asked. The conversation history is provided in the message sequence above - review it carefully before responding.\n`;
      }

      // Check if this is a simple greeting/conversational message
      const isGreeting =
        /^(hi|hey|hello|hola|good morning|good afternoon|good evening|greetings|sup|what's up|whats up|yo)\s*[!.?]*$/i.test(
          userQuery.trim(),
        );
      const isShortConversational =
        userQuery.trim().length < 30 &&
        !context &&
        (userQuery.toLowerCase().includes("how are you") ||
          userQuery.toLowerCase().includes("how r u") ||
          userQuery.toLowerCase().includes("thank") ||
          userQuery.toLowerCase().includes("cool") ||
          userQuery.toLowerCase().includes("nice") ||
          userQuery.toLowerCase().includes("ok") ||
          userQuery.toLowerCase().includes("okay"));

      // Create final response prompt
      const systemPrompt = `You are a fashion AI assistant for Anything AI with VISION capabilities.

${conversationContext}

${
  state.includeRating
    ? `The user's outfit has a rating of ${state.rating}/10.`
    : ""
}

${
  state.imageUrl
    ? `You will receive an IMAGE of the user's current outfit. Analyze the image carefully and describe what you see - colors, fit, style, materials, etc.`
    : ""
}

${context ? `You have access to the following information:\n\n${context}` : ""}

${
  isGreeting || isShortConversational
    ? `
The user is greeting you or having casual conversation. Respond naturally and conversationally:
- Keep it SHORT (1-2 sentences maximum)
- Be friendly and warm
- Ask what you can help them with today (outfit suggestions, styling advice, etc.)
- Do NOT analyze their wardrobe or give unsolicited outfit breakdowns
- Match their energy and tone

Example responses:
- "Hi! How can I help style your look today?"
- "Hey there! What would you like help with - outfit suggestions or styling advice?"
- "Hello! Ready to find the perfect outfit?"
`
    : userQuery.toLowerCase().includes("describe")
      ? `
IMPORTANT: Since the user is asking you to describe the outfit:
1. First, carefully analyze the IMAGE provided and describe what you see
2. Then reference the outfit details from the data (outfit components, rating, etc.)
3. Provide CONCISE observations about:
   - Colors and color combinations
   - Fit and silhouette
   - Material/fabric appearance
   - Overall style and vibe
   - How well the pieces complement each other
4. Consider the rating (${state.rating}/10) in your analysis
5. Keep it BRIEF - 3-4 sentences max, then ask if they want suggestions
`
      : isOutfitRecommendation
        ? `
The user is asking for outfit recommendations. Keep response CONCISE:

1. **Context** (1 line only):
   - Mention weather + occasion if relevant

2. **Recommendation** (2-3 sentences):
   - Suggest specific items from their wardrobe
   - Briefly explain why it works

3. **Optional**: Ask if they want more details or alternatives

Be conversational and to-the-point. No long explanations.
`
        : `Provide a helpful, personalized response to the user's question.

KEY RULES:
- Keep responses CONCISE (3-4 sentences max)
- Get to the point quickly
- If suggesting alternatives:
  * Mention 2-3 specific items from their wardrobe
  * Brief reason why (1 sentence)
- End with a relevant question if more info is needed
- Be encouraging but brief`
}

${isGreeting || isShortConversational ? "" : "ALWAYS be concise - users prefer shorter, actionable responses over long explanations."}`;

      console.log("🤖 Invoking LLM for final response...");

      // Build messages with image support for vision
      const messages: any[] = [new SystemMessage(systemPrompt)];

      // Add conversation history as proper message objects
      if (state.conversationHistory && state.conversationHistory.length > 0) {
        console.log(
          `💬 Adding ${state.conversationHistory.length} conversation history messages`,
        );
        state.conversationHistory.forEach((msg) => {
          if (msg.role === "user") {
            messages.push(new HumanMessage(msg.content));
          } else if (msg.role === "assistant") {
            messages.push(new AIMessage(msg.content));
          }
        });
      }

      // Determine if vision mode is needed for this query
      const needsVision =
        state.imageUrl &&
        !isGreeting &&
        !isShortConversational &&
        // First message in conversation - show the outfit
        (!state.conversationHistory ||
          state.conversationHistory.length === 0 ||
          // Explicitly asking about visual aspects
          /\b(outfit|look|wear|wearing|color|style|fit|match|coord|describe|show|see|image|photo|picture|this)\b/i.test(
            userQuery,
          ) ||
          // Asking "how is" or "how does"
          /^how (is|does|do)/i.test(userQuery.trim())) &&
        // NOT asking about conversation history
        !/\b(last|previous|earlier|before|said|told|message|conversation|history)\b/i.test(
          userQuery,
        );

      // Add user message with image if vision is needed
      if (needsVision) {
        console.log(
          "📸 Vision mode: Adding image URL for analysis:",
          state.imageUrl,
        );

        const humanMessageContent = [
          {
            type: "text",
            text: userQuery,
          },
          {
            type: "image_url",
            image_url: {
              url: state.imageUrl,
              detail: "high",
            },
          },
        ];

        messages.push(
          new HumanMessage({
            content: humanMessageContent,
          }),
        );
      } else {
        if (isGreeting || isShortConversational) {
          console.log("👋 Greeting detected - text-only mode");
        } else if (!state.imageUrl) {
          console.log("⚠️ No image URL provided - text-only mode");
        } else {
          console.log(
            "💬 Text-only mode - query doesn't require vision (conversation/general question)",
          );
        }
        // Regular text message
        messages.push(...state.messages);
      }

      console.log("🚀 Sending to GPT-4o with", messages.length, "messages");
      const response = await this.llm.invoke(messages);

      const finalResponse = response.content.toString();
      console.log("✅ Final response generated, length:", finalResponse.length);
      console.log(
        "📝 Final response preview:",
        finalResponse.substring(0, 100),
      );
      console.log("💬 === RESPONDER NODE COMPLETE ===\n");

      return { finalResponse };
    } catch (error) {
      console.error("❌ Error in responder:", error);
      console.error(
        "❌ Error stack:",
        error instanceof Error ? error.stack : "N/A",
      );
      return {
        finalResponse: `I apologize, but I encountered an error: ${error}`,
      };
    }
  }

  /**
   * Process a chat message
   */
  async processMessage(input: {
    message: string;
    userId: string;
    outfitId?: number;
    rating?: number;
    includeRating?: boolean;
    imageUrl?: string;
    conversationHistory?: Array<{
      role: "user" | "assistant";
      content: string;
      timestamp: number;
    }>;
  }): Promise<string> {
    try {
      console.log("\n🎬 ===== STARTING PROCESS MESSAGE =====");
      console.log("📥 Input:", JSON.stringify(input, null, 2));

      const initialState: Partial<AgentStateType> = {
        messages: [new HumanMessage(input.message)],
        userId: input.userId,
        outfitId: input.outfitId,
        rating: input.rating,
        includeRating: input.includeRating,
        imageUrl: input.imageUrl,
        conversationHistory: input.conversationHistory || [],
      };

      console.log("📦 Initial state prepared");
      console.log("🚀 Invoking graph...");

      // Run the graph
      const result = await this.graph.invoke(initialState);

      console.log("\n✅ Graph execution completed");
      console.log("📊 Graph result keys:", Object.keys(result || {}));
      console.log("📊 Full result:", JSON.stringify(result, null, 2));
      console.log("📝 Final response exists:", !!result?.finalResponse);
      console.log("📝 Final response value:", result?.finalResponse);
      console.log("🏁 ===== PROCESS MESSAGE COMPLETE =====\n");

      return (
        result.finalResponse ||
        "I apologize, I was unable to generate a response."
      );
    } catch (error) {
      console.error("\n❌ ===== ERROR IN PROCESS MESSAGE =====");
      console.error("❌ Error:", error);
      console.error(
        "❌ Error stack:",
        error instanceof Error ? error.stack : "N/A",
      );
      console.error("❌ =======================================\n");
      throw error;
    }
  }
}
