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
    state: AgentStateType
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

    // Decision logic
    let nextStep: "mcp" | "rag" | "both" | "respond" = "respond";

    // Check if we need MCP (user data queries)
    const needsMCP =
      userQuery.includes("wardrobe") ||
      userQuery.includes("apparel") ||
      userQuery.includes("outfit") ||
      userQuery.includes("suggest") ||
      userQuery.includes("improve") ||
      userQuery.includes("alternative") ||
      userQuery.includes("low rating") ||
      userQuery.includes("my clothes") ||
      (state.rating !== undefined && state.rating < 7);

    // Check if we need RAG (fashion knowledge queries)
    const needsRAG =
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
    } else if (state.mcpResults && !state.ragResults && state.nextStep === "both") {
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
    state: AgentStateType
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

      // Create analysis prompt
      const systemPrompt = `You are a fashion data analyst with access to user wardrobe data.
      
Available tools:
- get_user_apparels: Get user's clothing items
- get_outfit_details: Get specific outfit information
- get_user_profile: Get user profile
- suggest_apparels: Suggest alternative items to improve outfit

User ID: ${state.userId}
${state.outfitId ? `Outfit ID: ${state.outfitId}` : ""}
${state.rating ? `Current Rating: ${state.rating}/10` : ""}

Analyze the query and use the appropriate tools to gather relevant user data.
Query: ${userQuery}`;

      const response = await llmWithTools.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userQuery),
      ]);

      // Execute tool calls if any
      let mcpResults = "No specific user data retrieved.";
      console.log("🔍 Checking for tool calls:", response.tool_calls?.length || 0);
      
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
          })
        );
        mcpResults = toolResults.join("\n\n");
      }

      console.log("📊 MCP Results length:", mcpResults.length);
      console.log("🔧 === MCP AGENT NODE COMPLETE ===\n");

      return { mcpResults, nextStep: undefined };
    } catch (error) {
      console.error("❌ Error in MCP agent:", error);
      console.error("❌ Error stack:", error instanceof Error ? error.stack : 'N/A');
      // Return error but clear nextStep to prevent infinite loop
      return { mcpResults: `Error: ${error}`, nextStep: undefined };
    }
  }

  /**
   * RAG Agent Node - Queries fashion knowledge base
   */
  private async ragAgentNode(
    state: AgentStateType
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
    state: AgentStateType
  ): Promise<Partial<AgentStateType>> {
    try {
      console.log("\n💬 === RESPONDER NODE ===");
      console.log("📦 State keys:", Object.keys(state));
      console.log("📊 MCP Results present:", !!state.mcpResults);
      console.log("📚 RAG Results present:", !!state.ragResults);
      
      const userQuery =
        state.messages[state.messages.length - 1].content.toString();
      console.log("📝 Query:", userQuery);

      // Build context from MCP and RAG results
      let contextParts: string[] = [];

      if (state.mcpResults) {
        contextParts.push(`USER DATA:\n${state.mcpResults}`);
      }

      if (state.ragResults) {
        contextParts.push(`FASHION KNOWLEDGE:\n${state.ragResults}`);
      }

      const context = contextParts.join("\n\n---\n\n");

      // Create final response prompt
      const systemPrompt = `You are a fashion AI assistant for Anything AI.

${
  state.includeRating
    ? `The user's outfit has a rating of ${state.rating}/10.`
    : ""
}

${context ? `You have access to the following information:\n\n${context}` : ""}

Provide a helpful, personalized response to the user's question. If suggesting alternatives or improvements:
1. Reference specific items from their wardrobe (if available)
2. Explain WHY the suggestions would improve the outfit
3. Cite fashion principles when applicable
4. Be encouraging and constructive

Keep responses clear, practical, and concise.`;

      console.log("🤖 Invoking LLM for final response...");
      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        ...state.messages,
      ]);

      const finalResponse = response.content.toString();
      console.log("✅ Final response generated, length:", finalResponse.length);
      console.log("📝 Final response preview:", finalResponse.substring(0, 100));
      console.log("💬 === RESPONDER NODE COMPLETE ===\n");

      return { finalResponse };
    } catch (error) {
      console.error("❌ Error in responder:", error);
      console.error("❌ Error stack:", error instanceof Error ? error.stack : 'N/A');
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
      console.error("❌ Error stack:", error instanceof Error ? error.stack : 'N/A');
      console.error("❌ =======================================\n");
      throw error;
    }
  }
}
