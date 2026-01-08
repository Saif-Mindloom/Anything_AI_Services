import { Client as MCPClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { config } from "./config.js";

/**
 * MCP Client for connecting to Anything AI MCP Server
 */
export class AnythingAIMCPClient {
  private client: MCPClient | null = null;
  private transport: StdioClientTransport | null = null;
  private tools: Map<string, any> = new Map();

  async connect() {
    if (!config.mcpServerEnabled) {
      console.log("MCP Server is disabled");
      return;
    }

    try {
      this.client = new MCPClient(
        {
          name: "langgraph-service-mcp-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      // Create transport - connecting to MCP server via stdio
      this.transport = new StdioClientTransport({
        command: config.mcpServerCommand,
        args: config.mcpServerArgs,
        env: {
          ...process.env,
          BACKEND_GRAPHQL_URL: process.env.BACKEND_GRAPHQL_URL || "http://backend:4000/graphql",
        },
      });

      await this.client.connect(this.transport);
      console.log("✅ Connected to MCP Server");

      // Fetch available tools
      const toolsList = await this.client.listTools();
      console.log(`📦 Loaded ${toolsList.tools.length} MCP tools`);

      // Store tools for later use
      toolsList.tools.forEach((tool) => {
        this.tools.set(tool.name, tool);
      });
    } catch (error) {
      console.error("❌ Failed to connect to MCP Server:", error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client && this.transport) {
      await this.client.close();
      console.log("Disconnected from MCP Server");
    }
  }

  /**
   * Execute an MCP tool
   */
  async callTool(toolName: string, args: Record<string, any>) {
    if (!this.client) {
      throw new Error("MCP Client not connected");
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      return result;
    } catch (error) {
      console.error(`Error calling MCP tool ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Get all available tools as LangChain tools
   */
  getLangChainTools() {
    const langchainTools: any[] = [];

    for (const [name, mcpTool] of this.tools.entries()) {
      // Create tool with proper schema for OpenAI
      const simpleTool: any = {
        name: name,
        description: mcpTool.description || `Execute ${name}`,
        schema: mcpTool.inputSchema || {
          type: "object",
          properties: {},
          required: [],
        },
        func: async (input: any) => {
          const args = typeof input === "string" ? { query: input } : input;
          const result = await this.callTool(name, args);
          // Extract text content from MCP response
          if (
            result.content &&
            Array.isArray(result.content) &&
            result.content.length > 0
          ) {
            const firstContent = result.content[0] as any;
            if (firstContent && firstContent.text) {
              return firstContent.text;
            }
          }
          return JSON.stringify(result);
        },
        invoke: async function (input: any) {
          return this.func(input);
        },
      };

      langchainTools.push(simpleTool);
    }

    return langchainTools;
  }
}
