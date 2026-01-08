import dotenv from "dotenv";

dotenv.config();

export const config = {
  backendGraphqlUrl:
    process.env.BACKEND_GRAPHQL_URL || "http://localhost:4000/graphql",
  backendApiKey: process.env.BACKEND_API_KEY || "",
  mcpServerPort: parseInt(process.env.MCP_SERVER_PORT || "3001"),
  mcpApiKey: process.env.MCP_API_KEY || "",
  nodeEnv: process.env.NODE_ENV || "development",
};

// Validate required config
if (!config.backendGraphqlUrl) {
  throw new Error("BACKEND_GRAPHQL_URL is required");
}

console.log("MCP Server Configuration:");
console.log("- Backend GraphQL URL:", config.backendGraphqlUrl);
console.log("- MCP Server Port:", config.mcpServerPort);
console.log("- Environment:", config.nodeEnv);
