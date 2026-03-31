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

    // Detect "my [clothing item]" — user is referring to a personal item they own
    const refersToPersonalItem =
      /\bmy\b.{0,30}(shirt|tshirt|t-shirt|sweater|jeans|pants|dress|skirt|jacket|coat|hoodie|top|blouse|shorts|suit|shoes|sneakers|boots|heels|bag|hat|scarf|belt|leggings|kurta|saree|salwar|kurti|sweatshirt|cardigan|blazer|trousers|chinos|joggers|item|piece|cloth)/i.test(
        userQuery,
      );

    // Detect wardrobe inventory queries like "what shoes do I have?", "how many shoes", "show me all"
    const isWardrobeInventoryQuery =
      // Pattern 1: "what/which...do i have/own"
      (((userQuery.includes("what") || userQuery.includes("which")) &&
        (userQuery.includes("do i have") || userQuery.includes("do i own"))) ||
        // Pattern 2: "how many...do i have/have i got"
        (userQuery.includes("how many") &&
          (userQuery.includes("do i have") ||
            userQuery.includes("have i") ||
            userQuery.includes("i have"))) ||
        // Pattern 3: "show me all/my", "list all/my"
        ((userQuery.includes("show me") || userQuery.includes("list")) &&
          (userQuery.includes("all") ||
            userQuery.includes("my") ||
            userQuery.includes("every")))) &&
      // Must reference wardrobe items
      (userQuery.includes("shoe") ||
        userQuery.includes("sneaker") ||
        userQuery.includes("boot") ||
        userQuery.includes("heel") ||
        userQuery.includes("accessor") ||
        userQuery.includes("clothes") ||
        userQuery.includes("apparel") ||
        userQuery.includes("wardrobe") ||
        userQuery.includes("item") ||
        userQuery.includes("top") ||
        userQuery.includes("bottom") ||
        userQuery.includes("dress") ||
        userQuery.includes("shirt") ||
        userQuery.includes("pant") ||
        userQuery.includes("jean") ||
        userQuery.includes("jacket") ||
        userQuery.includes("coat"));

    // Detect pairing/matching queries — user wants to combine items
    const isPairingQuery =
      userQuery.includes("go well with") ||
      userQuery.includes("goes well with") ||
      userQuery.includes("goes with") ||
      userQuery.includes("go with") ||
      userQuery.includes("pair with") ||
      userQuery.includes("pairs with") ||
      userQuery.includes("match with") ||
      userQuery.includes("matches with") ||
      userQuery.includes("combine with") ||
      userQuery.includes("wear with") ||
      userQuery.includes("look good with") ||
      userQuery.includes("looks good with") ||
      userQuery.includes("complement");

    // Check if we need MCP (user data queries, weather, occasions)
    const needsMCP =
      isOutfitRecommendation || // Outfit recommendations always need user data
      refersToPersonalItem || // User is asking about something they own
      isWardrobeInventoryQuery || // User is asking what items they have
      isPairingQuery || // User wants to pair/match items
      userQuery.includes("wardrobe") ||
      userQuery.includes("apparel") ||
      userQuery.includes("outfit") ||
      userQuery.includes("accessory") ||
      userQuery.includes("accessories") ||
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

      // Detect if query is specifically about accessories (including shoes)
      const lowerQuery = userQuery.toLowerCase();
      const isAccessoryQuery =
        lowerQuery.includes("accessor") ||
        lowerQuery.includes("bag") ||
        lowerQuery.includes("jewelry") ||
        lowerQuery.includes("earring") ||
        lowerQuery.includes("necklace") ||
        lowerQuery.includes("bracelet") ||
        lowerQuery.includes("ring") ||
        lowerQuery.includes("watch") ||
        lowerQuery.includes("hat") ||
        lowerQuery.includes("cap") ||
        lowerQuery.includes("scarf") ||
        lowerQuery.includes("belt") ||
        lowerQuery.includes("shoe") ||
        lowerQuery.includes("sneaker") ||
        lowerQuery.includes("boot") ||
        lowerQuery.includes("heel");

      // Create analysis prompt
      const systemPrompt = `You are a fashion data analyst. Your ONLY job is to call the appropriate tools to fetch user data. You MUST NOT provide any analysis or recommendations - only fetch data.

CRITICAL INSTRUCTION: You MUST call at least one tool. DO NOT respond without calling tools.

Available tools:
- get_user_apparels: Get user's clothing items (wardrobe). Can filter by category: "top", "bottom", "shoe", "accessory", "outerwear", "dress"
- get_outfit_details: Get specific outfit information including AI-generated accessories
- get_user_profile: Get user profile and preferences
- suggest_apparels: Suggest alternative items to improve outfit
- get_weather_forecast: Get weather forecast (temperature, conditions, rain probability)
- get_occasions: Get upcoming holidays/occasions (festivals, special days)

User ID: ${state.userId}
${state.outfitId ? `Outfit ID: ${state.outfitId}` : ""}
${state.rating ? `Current Rating: ${state.rating}/10` : ""}

Query: ${userQuery}

IMPORTANT INSTRUCTIONS:

${
  lowerQuery.includes("shoe") ||
  lowerQuery.includes("sneaker") ||
  lowerQuery.includes("boot") ||
  lowerQuery.includes("heel")
    ? `
🔴 USER IS ASKING ABOUT SHOES - YOU MUST CALL THIS TOOL:
Call: get_user_apparels with { "userId": "${state.userId}", "category": "shoe" }`
    : isAccessoryQuery
      ? `
🔴 USER IS ASKING ABOUT ACCESSORIES - YOU MUST CALL THIS TOOL:
Call: get_user_apparels with { "userId": "${state.userId}", "category": "accessory" }`
      : isOutfitRecommendation
        ? `
🔴 USER IS ASKING FOR OUTFIT RECOMMENDATIONS - YOU MUST CALL THESE TOOLS IN ORDER:
1. Call: get_weather_forecast with { "location": "Mumbai, India", "days": 7 }
2. Call: get_occasions with { "includeUpcoming": true }
3. Call: get_user_apparels with { "userId": "${state.userId}" }

You MUST call all three tools. The user cannot receive proper outfit recommendations without this data.`
        : lowerQuery.includes("wardrobe") ||
            lowerQuery.includes("clothes") ||
            lowerQuery.includes("apparel")
          ? `
🔴 USER IS ASKING ABOUT THEIR WARDROBE - YOU MUST CALL THIS TOOL:
Call: get_user_apparels with { "userId": "${state.userId}" }`
          : state.outfitId
            ? `
🔴 USER IS ASKING ABOUT A SPECIFIC OUTFIT - YOU MUST CALL THIS TOOL:
Call: get_outfit_details with { "userId": "${state.userId}", "outfitId": ${state.outfitId} }`
            : `
Based on the query, determine which tool(s) to call and execute them. You MUST call at least one tool - do not respond without fetching data.`
}

REMEMBER: Your job is ONLY to fetch data by calling tools. Do NOT provide analysis, recommendations, or conversational responses.`;

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
      console.log(
        "🔍 Response content:",
        response.content?.toString().substring(0, 200),
      );

      if (response.tool_calls && response.tool_calls.length > 0) {
        console.log("🛠️  Executing", response.tool_calls.length, "tool(s)");
        const toolResults = await Promise.all(
          response.tool_calls.map(async (toolCall) => {
            console.log("🔧 Calling tool:", toolCall.name);
            console.log(
              "🔧 Tool args:",
              JSON.stringify(toolCall.args, null, 2),
            );

            const tool = mcpTools.find((t) => t.name === toolCall.name);
            if (tool) {
              try {
                // Auto-inject userId if not present in the tool call
                const enhancedArgs = { ...toolCall.args };
                if (!enhancedArgs.userId && state.userId) {
                  console.log(
                    `🔧 Auto-injecting userId: ${state.userId} into tool: ${toolCall.name}`,
                  );
                  enhancedArgs.userId = state.userId;
                }

                console.log(
                  "🔧 Enhanced args:",
                  JSON.stringify(enhancedArgs, null, 2),
                );
                const result = await tool.invoke(enhancedArgs);
                console.log("✅ Tool", toolCall.name, "succeeded");
                console.log(
                  "✅ Result preview:",
                  typeof result === "string"
                    ? result.substring(0, 200)
                    : JSON.stringify(result).substring(0, 200),
                );
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
      } else {
        // LLM did not call any tools - this is a problem for data queries
        console.log("⚠️  WARNING: LLM did not call any tools!");
        console.log(
          "⚠️  This might indicate the LLM ignored the tool-calling instruction",
        );
        console.log("⚠️  LLM response:", response.content?.toString());

        // For critical queries, return an error message
        const criticalQuery =
          userQuery.toLowerCase().includes("shoe") ||
          userQuery.toLowerCase().includes("wardrobe") ||
          userQuery.toLowerCase().includes("apparel") ||
          userQuery.toLowerCase().includes("clothes") ||
          userQuery.toLowerCase().includes("recommend outfit") ||
          userQuery.toLowerCase().includes("what to wear");

        if (criticalQuery) {
          mcpResults =
            "ERROR: The system failed to retrieve your wardrobe data. This is a technical issue - the data fetching tool was not executed properly.";
        }
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
        // Check if MCP results contain an error or no data
        if (
          state.mcpResults.includes("ERROR:") ||
          state.mcpResults.includes("No specific user data retrieved") ||
          state.mcpResults.includes("failed to retrieve")
        ) {
          console.log("⚠️  MCP results contain error or no data");
          console.log("⚠️  MCP results:", state.mcpResults.substring(0, 200));
          contextParts.push(
            `SYSTEM ERROR: ${state.mcpResults}\n\nIMPORTANT: Tell the user there was a technical issue retrieving their wardrobe data and ask them to try again. Do NOT make up data or provide generic suggestions.`,
          );
        } else {
          contextParts.push(`USER DATA:\n${state.mcpResults}`);
        }
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

CRITICAL RULE — APPLIES TO EVERY RESPONSE:
Whenever you mention ANY apparel item (clothing, accessory, shoes, etc.), you MUST include ALL of the following, formatted exactly like this:

1. **[Apparel Name]** - [One sentence description or reason]
   - ID: [exact numeric ID from the data]
   - [URL](exact image URL from the data)

- The ID and image URL MUST come directly from the USER DATA provided above.
- NEVER invent, guess, or fabricate item names, IDs, or URLs.
- NEVER use placeholder or example URLs (e.g., "https://example.com/..." or "https://..." are NOT acceptable).
- NEVER inline the ID or URL inside a sentence.
- If the USER DATA section above does not contain real apparel items with actual IDs and image URLs, do NOT suggest any specific items. Instead, let the user know their wardrobe data could not be retrieved and ask them to try again.

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
5. For each apparel item mentioned, use the required structured format (name, ID, URL) from the data
6. Keep it BRIEF - 3-4 sentences max, then ask if they want suggestions
`
      : isOutfitRecommendation
        ? `
The user is asking for outfit recommendations. Keep response CONCISE:

1. **Context** (1 line only):
   - Mention weather + occasion if relevant

2. **Recommendation**:
   - Suggest 2-3 specific items from their wardrobe using the required structured format (name, ID, URL)

3. **Optional**: Ask if they want more details or alternatives

Be conversational and to-the-point. No long explanations.
`
        : `Provide a helpful, personalized response to the user's question.

KEY RULES:
- Keep responses CONCISE
- Get to the point quickly
- When mentioning any apparel items, use the required structured format (name, ID, URL) for each one
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
