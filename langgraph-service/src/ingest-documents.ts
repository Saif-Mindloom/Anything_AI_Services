import { OpenAIEmbeddings } from "@langchain/openai";
import { PGVectorStore } from "@langchain/community/vectorstores/pgvector";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { PoolConfig, Pool } from "pg";
import { config } from "./config.js";
import * as fs from "fs";
import * as path from "path";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";

/**
 * Document Ingestion Tool for RAG System
 *
 * This tool allows you to add fashion documents to the vector database
 * for the RAG system to use when answering questions.
 *
 * Usage:
 *   npm run ingest -- path/to/documents
 *   npm run ingest:file -- path/to/document.pdf "Fashion Rules"
 */

interface DocumentMetadata {
  file_id?: string;
  file_title?: string;
  file_path?: string;
  source?: string;
  chunk_index?: number;
}

export class DocumentIngestor {
  private embeddings: OpenAIEmbeddings;
  private vectorStore: PGVectorStore | null = null;
  private textSplitter: RecursiveCharacterTextSplitter;
  private pool: Pool | null = null;

  constructor() {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: config.openaiApiKey,
      modelName: "text-embedding-3-small",
    });

    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
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

      console.log("✅ Vector store initialized");
    } catch (error) {
      console.error("❌ Failed to initialize vector store:", error);
      throw error;
    }
  }

  /**
   * Ingest a single file
   */
  async ingestFile(
    filePath: string,
    title?: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.vectorStore) {
      throw new Error("Vector store not initialized");
    }

    console.log(`📄 Processing: ${filePath}`);

    const ext = path.extname(filePath).toLowerCase();
    let content: string = "";

    try {
      // Read file content based on extension
      if (ext === ".txt" || ext === ".md") {
        content = fs.readFileSync(filePath, "utf-8");
      } else if (ext === ".pdf") {
        console.log(`  📕 Extracting text from PDF...`);
        const loader = new PDFLoader(filePath);
        const docs = await loader.load();
        content = docs.map((doc) => doc.pageContent).join("\n\n");
        console.log(`  ✅ Extracted ${docs.length} pages from PDF`);
      } else if (ext === ".docx") {
        console.log(
          `⚠️  .docx files require additional processing. Using text files is recommended.`
        );
        console.log(
          `   For now, skipping this file. Convert to .txt or .md format.`
        );
        return;
      } else {
        // Try reading as text
        content = fs.readFileSync(filePath, "utf-8");
      }

      if (!content || content.trim().length === 0) {
        throw new Error("File is empty or could not be read");
      }

      // Create document
      const doc = new Document({
        pageContent: content,
        metadata: { source: filePath },
      });

      // Split documents into chunks
      const splitDocs = await this.textSplitter.splitDocuments([doc]);

      // Add metadata
      const fileName = path.basename(filePath);
      const fileId = `doc_${Date.now()}_${fileName.replace(
        /[^a-zA-Z0-9]/g,
        "_"
      )}`;
      const fileTitle = title || fileName;

      const docsWithMetadata = splitDocs.map((doc, idx) => {
        return new Document({
          pageContent: doc.pageContent,
          metadata: {
            ...doc.metadata,
            ...metadata,
            file_id: fileId,
            file_title: fileTitle,
            file_path: filePath,
            chunk_index: idx,
          } as DocumentMetadata,
        });
      });

      // Add to vector store
      await this.vectorStore.addDocuments(docsWithMetadata);

      console.log(`✅ Ingested: ${fileTitle} (${splitDocs.length} chunks)`);
    } catch (error) {
      console.error(`❌ Failed to ingest ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Ingest all files in a directory
   */
  async ingestDirectory(
    dirPath: string,
    recursive: boolean = true
  ): Promise<void> {
    console.log(`📁 Scanning directory: ${dirPath}`);

    const files = fs.readdirSync(dirPath);
    let processedCount = 0;
    let skippedCount = 0;

    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory() && recursive) {
        await this.ingestDirectory(fullPath, recursive);
      } else if (stat.isFile()) {
        const ext = path.extname(file).toLowerCase();
        if ([".txt", ".md", ".pdf"].includes(ext)) {
          try {
            await this.ingestFile(fullPath);
            processedCount++;
          } catch (error) {
            console.error(`⚠️  Skipped ${file}: ${error}`);
            skippedCount++;
          }
        } else {
          console.log(`⏭️  Skipped ${file} (unsupported format: ${ext})`);
          skippedCount++;
        }
      }
    }

    console.log(
      `\n📊 Summary: ${processedCount} files processed, ${skippedCount} files skipped`
    );
  }

  /**
   * Ingest text directly
   */
  async ingestText(
    content: string,
    title: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.vectorStore) {
      throw new Error("Vector store not initialized");
    }

    console.log(`📝 Ingesting text: ${title}`);

    // Create document
    const doc = new Document({
      pageContent: content,
      metadata: {
        source: "direct_input",
        file_title: title,
        ...metadata,
      },
    });

    // Split into chunks
    const splitDocs = await this.textSplitter.splitDocuments([doc]);

    // Add metadata
    const fileId = `doc_${Date.now()}_${title.replace(/[^a-zA-Z0-9]/g, "_")}`;

    const docsWithMetadata = splitDocs.map((doc, idx) => {
      return new Document({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          file_id: fileId,
          chunk_index: idx,
        } as DocumentMetadata,
      });
    });

    // Add to vector store
    await this.vectorStore.addDocuments(docsWithMetadata);

    console.log(`✅ Ingested: ${title} (${splitDocs.length} chunks)`);
  }

  /**
   * Search for documents (for testing)
   */
  async search(query: string, topK: number = 5): Promise<void> {
    if (!this.vectorStore) {
      throw new Error("Vector store not initialized");
    }

    console.log(`\n🔍 Searching for: "${query}"\n`);

    const results = await this.vectorStore.similaritySearch(query, topK);

    results.forEach((doc, idx) => {
      const metadata = doc.metadata as DocumentMetadata;
      console.log(`\n--- Result ${idx + 1} ---`);
      console.log(`Title: ${metadata.file_title || "Unknown"}`);
      console.log(
        `Source: ${metadata.source || metadata.file_path || "Unknown"}`
      );
      console.log(`Content:\n${doc.pageContent.substring(0, 200)}...`);
    });
  }
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const ingestor = new DocumentIngestor();
  await ingestor.initialize();

  try {
    switch (command) {
      case "file":
        // Ingest a single file
        const filePath = args[1];
        const title = args[2];
        if (!filePath) {
          console.error("Usage: npm run ingest file <path> [title]");
          process.exit(1);
        }
        await ingestor.ingestFile(filePath, title);
        break;

      case "dir":
        // Ingest a directory
        const dirPath = args[1];
        if (!dirPath) {
          console.error("Usage: npm run ingest dir <path>");
          process.exit(1);
        }
        await ingestor.ingestDirectory(dirPath);
        break;

      case "text":
        // Ingest text directly
        const textTitle = args[1];
        const textContent = args[2];
        if (!textTitle || !textContent) {
          console.error("Usage: npm run ingest text <title> <content>");
          process.exit(1);
        }
        await ingestor.ingestText(textContent, textTitle);
        break;

      case "search":
        // Test search
        const query = args.slice(1).join(" ");
        if (!query) {
          console.error("Usage: npm run ingest search <query>");
          process.exit(1);
        }
        await ingestor.search(query);
        break;

      default:
        console.log(`
📚 Document Ingestion Tool

Usage:
  npm run ingest file <path> [title]     - Ingest a single file (.txt, .md)
  npm run ingest dir <path>              - Ingest all files in directory
  npm run ingest text <title> <content>  - Ingest text directly
  npm run ingest search <query>          - Test search

Examples:
  npm run ingest file ./docs/fashion-rules.txt "Fashion Rules 2024"
  npm run ingest dir ./docs/fashion
  npm run ingest text "Color Theory" "Red and blue create contrast..."
  npm run ingest search "what colors go well together"

Supported formats: .txt, .md
Note: PDF and DOCX support requires additional setup. Convert to .txt or .md for now.
        `);
    }

    console.log("\n✅ Done!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

// Run if called directly
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
