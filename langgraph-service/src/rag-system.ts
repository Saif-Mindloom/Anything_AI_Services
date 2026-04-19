import { ChatOpenAI } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { OpenAIEmbeddings } from "@langchain/openai";
import { PoolConfig, Pool } from "pg";
import { config } from "./config.js";

/**
 * Initialize RAG (Retrieval-Augmented Generation) system
 * Uses PostgreSQL with pgvector for fashion knowledge base
 */
export class RAGSystem {
  private vectorStore: PGVectorStore | null = null;
  private embeddings: OpenAIEmbeddings;
  private pool: Pool | null = null;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: config.openaiApiKey,
      modelName: "text-embedding-3-small",
    });
  }

  async initialize() {
    try {
      const pgConfig: PoolConfig = {
        host: config.postgres.host,
        port: config.postgres.port,
        database: config.postgres.database,
        user: config.postgres.user,
        password: config.postgres.password,
        ...(config.postgres.ssl
          ? { ssl: { rejectUnauthorized: false } }
          : {}),
      };

      // Create pool manually
      this.pool = new Pool(pgConfig);

      // Test connection
      const client = await this.pool.connect();
      client.release();

      // Create vector store with existing pool (won't try to create extension)
      this.vectorStore = new PGVectorStore(this.embeddings, {
        pool: this.pool,
        tableName: "documents_pg",
        columns: {
          idColumnName: "id",
          vectorColumnName: "embedding",
          contentColumnName: "text",
          metadataColumnName: "metadata",
        },
      });

      console.log("✅ RAG System initialized with PostgreSQL vector store");
    } catch (error) {
      console.error("❌ Failed to initialize RAG system:", error);
      throw error;
    }
  }

  /**
   * Search fashion knowledge base
   */
  async searchFashionKnowledge(
    query: string,
    topK: number = 5
  ): Promise<string> {
    if (!this.vectorStore) {
      throw new Error("RAG system not initialized");
    }

    try {
      const results = await this.vectorStore.similaritySearch(query, topK);

      if (results.length === 0) {
        return "No relevant fashion knowledge found.";
      }

      // Format results with metadata
      const formattedResults = results
        .map((doc, idx) => {
          const metadata = doc.metadata || {};
          const fileTitle = metadata.file_title || "Unknown Document";
          return `
[Document ${idx + 1}: ${fileTitle}]
${doc.pageContent}
`;
        })
        .join("\n---\n");

      return formattedResults;
    } catch (error) {
      console.error("Error searching fashion knowledge:", error);
      throw error;
    }
  }

  /**
   * Get fashion advice using RAG
   */
  async getFashionAdvice(query: string): Promise<string> {
    const knowledge = await this.searchFashionKnowledge(query);
    return knowledge;
  }
}
