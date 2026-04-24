import express from "express";
import { ApolloServer } from "apollo-server-express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import * as dotenv from "dotenv";
import uploadRoutes from "./services/uploadRouteHandlers";
import modelGenerationRoutes from "./resolvers/modelGeneration";
import userModelGenerationRoutes from "./services/userModelGenerationRoutes";
import modelRegenerationRoutes from "./services/modelRegenerationRoutes";
import clothingDetectionRoutes from "./resolvers/clothingDetection";
import jobStatusRoutes from "./resolvers/jobStatus";
import testApparelDescriptionRoutes from "./routes/testApparelDescription";
import apparelBackImageRoutes from "./routes/apparelBackImage";
import accessoryDetectionRoutes from "./routes/accessoryDetection";
dotenv.config();

// Extend Express Request type to include 'user'
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

import { connectDB } from "./config/database";
import { typeDefs } from "./schema";
import resolvers from "./resolvers/resolvers";
import { startScheduledDeletionJob } from "./queues/scheduledDeletionQueue";

const startServer = async (): Promise<void> => {
  try {
    // Connect to database
    await connectDB();

    // Create Express app
    const app = express();

    // Security middleware
    app.use(
      helmet({
        contentSecurityPolicy: false, // Disable for GraphQL Playground
        crossOriginEmbedderPolicy: false,
      }),
    );

    // CORS middleware (must be before routes)
    app.use(
      cors({
        origin:
          process.env.NODE_ENV === "production"
            ? [
                "https://yourdomain.com",
                "https://studio.apollographql.com",
                /^https:\/\/.*\.mindloom\.in$/,
              ]
            : [
                "http://localhost:3000",
                "http://localhost:4000",
                "http://localhost:5173",
                "http://localhost:5174",
                "http://localhost:5175",
                "http://localhost:5176",
                "http://192.168.1.8:5173",
                "http://192.168.1.8:5174",
                "http://192.168.1.8:5175",
                "http://192.168.1.8:5176",
                "http://192.0.0.2",
                "http://192.0.0.1",

                "https://studio.apollographql.com",
                "https://8ca203764262.ngrok-free.app",
                /^https:\/\/.*\.ngrok-free\.app$/,
                /^https:\/\/.*\.ngrok\.io$/,
                /^https:\/\/.*\.ngrok\.app$/,
                /^https:\/\/.*\.mindloom\.in$/,
              ],
        credentials: true,
      }),
    );

    // Body parser middleware (must be before routes)
    app.use(express.json({ limit: "10mb" }));
    app.use(express.urlencoded({ extended: true }));

    // Serve static files from public directory
    app.use(express.static("public"));

    // Routes (must be after body parser)
    app.use("/api/v1", uploadRoutes);
    app.use("/api/v1", modelGenerationRoutes);
    app.use("/api/v1", userModelGenerationRoutes);
    app.use("/api/v1", modelRegenerationRoutes);
    app.use("/api/v1", clothingDetectionRoutes);
    app.use("/api/v1", jobStatusRoutes);
    app.use("/api", jobStatusRoutes); // Also support /api/job-status/:jobId without v1
    app.use("/api/v1", testApparelDescriptionRoutes); // TEMP: apparel description tester
    app.use("/api/v1", apparelBackImageRoutes);
    app.use("/api/v1", accessoryDetectionRoutes);

    // Health check endpoint
    app.get("/health", (req, res) => {
      res.status(200).json({
        status: "OK",
        timestamp: new Date().toISOString(),
        service: "CDH Backend",
        version: "1.0.0",
      });
    });

    // Create Apollo Server
    const server = new ApolloServer({
      typeDefs,
      resolvers,
      plugins: [
        {
          async requestDidStart(requestContext) {
            const operationName =
              requestContext.request.operationName || "Anonymous";
            const query = requestContext.request.query || "";
            const operationType = query.trim().startsWith("mutation")
              ? "Mutation"
              : "Query";

            console.log(`🔵 GraphQL ${operationType}: ${operationName}`);

            return {
              async willSendResponse() {
                // Request completed
              },
            };
          },
        },
      ],
      context: async ({ req }) => {
        // Extract user from Authorization header
        const authHeader = req.headers.authorization;
        let user = null;

        if (authHeader && authHeader.startsWith("Bearer ")) {
          const token = authHeader.substring(7); // Remove 'Bearer ' prefix
          try {
            const { getUserFromToken } = await import("./helpers/utils");
            const decoded = await getUserFromToken(token);

            if (decoded && decoded.userId) {
              user = {
                userId: decoded.userId,
                email: decoded.email,
                type: decoded.type,
              };
              // Removed repetitive auth log - now tracked per operation above
            }
          } catch (error) {
            console.error("❌ Error verifying token:", error);
          }
        }

        return {
          req,
          user,
          ip: req.ip,
        };
      },
      introspection: process.env.NODE_ENV === "development" ? true : false,
      formatError: (error) => {
        console.error("GraphQL Error:", error);

        if (process.env.NODE_ENV === "production") {
          return new Error("Internal server error");
        }

        return error;
      },
    });

    // Apply GraphQL middleware
    await server.start();
    server.applyMiddleware({
      app,
      path: "/graphql",
      cors: false,
    });

    // Error handling middleware
    app.use(
      (
        err: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        console.error("Express Error:", err);
        res.status(500).json({
          error: "Internal Server Error",
          message:
            process.env.NODE_ENV === "development"
              ? err.message
              : "Something went wrong",
        });
      },
    );

    // 404 handler
    app.use("*", (req, res) => {
      res.status(404).json({
        error: "Not Found",
        message: "The requested resource was not found",
      });
    });

    const PORT = parseInt(process.env.PORT || "4000", 10);

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`\nServer ready at http://localhost:${PORT}`);
      console.log(`Server also accessible at http://192.168.1.8:${PORT}`);
      console.log(
        `GraphQL Playground at http://localhost:${PORT}${server.graphqlPath}`,
      );
      console.log(`Health check at http://localhost:${PORT}/health`);
      console.log(`Environment: ${process.env.NODE_ENV || "development"}`);
      console.log("✅ Backend build is running and logs are active.");
    });

    // Register daily scheduled-deletion background job in background so API boot is never blocked.
    startScheduledDeletionJob()
      .then(() => {
        console.log("✅ Scheduled deletion job initialized.");
      })
      .catch((error) => {
        console.error("❌ Failed to initialize scheduled deletion job:", error);
      });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully...");
  process.exit(0);
});

// Start the server
startServer();
