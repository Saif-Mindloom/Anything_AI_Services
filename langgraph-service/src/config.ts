import dotenv from "dotenv";

dotenv.config();

/** When true, use TLS for Postgres (required for RDS when SSL-only access is enforced). */
const parsePostgresSsl = (): boolean => process.env.POSTGRES_SSL === "true";

export const config = {
  port: parseInt(process.env.PORT || "3002"),
  nodeEnv: process.env.NODE_ENV || "development",

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || "",

  // MCP Server
  mcpServerCommand: process.env.MCP_SERVER_COMMAND || "node",
  mcpServerArgs: process.env.MCP_SERVER_ARGS?.split(",") || [],
  mcpServerEnabled: process.env.MCP_SERVER_ENABLED === "true",

  // PostgreSQL (for RAG)
  postgres: {
    host: process.env.POSTGRES_HOST || "localhost",
    port: parseInt(process.env.POSTGRES_PORT || "5432"),
    database: process.env.POSTGRES_DB || "anything_backend",
    user: process.env.POSTGRES_USER || "postgres",
    password: process.env.POSTGRES_PASSWORD || "postgres",
    ssl: parsePostgresSsl(),
  },

  // Authentication
  apiKey: process.env.API_KEY || "",
  n8nWebhookSecret: process.env.N8N_WEBHOOK_SECRET || "",
};

// Validate required config
if (!config.openaiApiKey) {
  throw new Error("OPENAI_API_KEY is required");
}

console.log("LangGraph Service Configuration:");
console.log("- Port:", config.port);
console.log("- Environment:", config.nodeEnv);
console.log("- MCP Server Enabled:", config.mcpServerEnabled);
console.log("- PostgreSQL:", `${config.postgres.host}:${config.postgres.port}`);
console.log("- PostgreSQL SSL:", config.postgres.ssl);
