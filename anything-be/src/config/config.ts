import * as dotenv from "dotenv";
dotenv.config();

const config = {
  development: {
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: process.env.DB_NAME || "anything_backend",
    host: process.env.DB_HOST || "127.0.0.1",
    dialect: "postgres" as const,
  },
  test: {
    username: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "postgres",
    database: (process.env.DB_NAME || "anything_backend") + "_test",
    host: process.env.DB_HOST || "127.0.0.1",
    dialect: "postgres" as const,
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    dialect: "postgres" as const,
    dialectOptions: {
      ssl:
        process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    },
  },
};

export default config;
