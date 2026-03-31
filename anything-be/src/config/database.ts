// src/config/database.js
import { Sequelize } from "sequelize";
import * as dotenv from "dotenv";
dotenv.config();

// Plain config object for Sequelize CLI
const dbConfig = {
  username: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_NAME || "anything_backend",
  host: process.env.DB_HOST || "127.0.0.1",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  dialect: "postgres" as const,
  logging: process.env.NODE_ENV === "development" ? console.log : false,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
  timezone: "+05:30",
  define: {
    timestamps: true,
    underscored: true,
    created_at: "created_at",
    updated_at: "updated_at",
  },
  dialectOptions: {
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    supportBigNumbers: true,
    bigNumberStrings: true,
  },
};

// Instantiate Sequelize for runtime use
export const sequelize = new Sequelize(
  dbConfig.database,
  dbConfig.username,
  dbConfig.password,
  dbConfig
);

import { initUserModel } from "../models/user.model";
import { initEmailOtpModel } from "../models/emailOtp.model";
import { initApparelModel } from "../models/apparel.model";
import { initOutfitModel } from "../models/outfit.model";
import { initCalendarEntryModel } from "../models/calendarEntry.model";

initUserModel(sequelize);
initEmailOtpModel(sequelize);
initApparelModel(sequelize);
initOutfitModel(sequelize);
initCalendarEntryModel(sequelize);

// Function to connect at runtime
export const connectDB = async (): Promise<void> => {
  try {
    await sequelize.authenticate();
    console.log(`Database connected successfully (PostgreSQL)`);

    if (process.env.NODE_ENV === "development") {
      // Temporarily disable alter to avoid timestamp column conflicts
      // Use migrations instead for schema changes
      await sequelize.sync({ force: false, alter: false });
      console.log("Database synchronized");
    }
  } catch (error) {
    console.error("Unable to connect to database:", error);
    process.exit(1);
  }
};

// Export both for CLI and runtime
export default {
  sequelize,
  connectDB,
  development: dbConfig,
  test: {
    ...dbConfig,
    database: (process.env.DB_NAME || "anything_backend") + "_test",
  },
  production: dbConfig,
};
