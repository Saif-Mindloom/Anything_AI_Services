/**
 * Utility Helper Functions
 *
 * This file contains general utility functions used throughout the application.
 */

/**
 * Delay execution for specified milliseconds
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Generate a random ID
 */
export const generateId = (prefix: string = "id"): string => {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Validate email format
 */
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Format file size in human readable format
 */
export const formatFileSize = (bytes: number): string => {
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Bytes";
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
};

/**
 * Deep clone an object
 */
export const deepClone = <T>(obj: T): T => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Sanitize string for use in filenames
 */
export const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-z0-9.-]/gi, "_").toLowerCase();
};

/**
 * Check if value is empty (null, undefined, empty string, empty array, empty object)
 */
export const isEmpty = (value: any): boolean => {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
};

/**
 * Convert string to camelCase
 */
export const toCamelCase = (str: string): string => {
  return str.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ""));
};

/**
 * Convert string to snake_case
 */
export const toSnakeCase = (str: string): string => {
  return str
    .replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
    .replace(/^_/, "");
};

export const generateOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

export const hashOTP = async (otp: string): Promise<string> => {
  const bcrypt = await import("bcryptjs");
  const saltRounds = 10;
  return bcrypt.hash(otp, saltRounds);
};

export const verifyOTP = async (
  otp: string,
  hashedOTP: string,
): Promise<boolean> => {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(otp, hashedOTP);
};

export const getOTPExpiry = (): Date => {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + 5);
  return expiry;
};

export const generateSessionToken = async (
  email: string,
  userId?: number,
): Promise<string> => {
  const jwt = await import("jsonwebtoken");
  const payload = {
    email,
    userId: userId || null,
    type: "session",
    iat: Math.floor(Date.now() / 1000),
  };

  const secret =
    process.env.JWT_SECRET || "your_jwt_secret_change_this_in_production";
  return jwt.sign(payload, secret);
};

export const verifyToken = async (token: string): Promise<any> => {
  const jwt = await import("jsonwebtoken");
  const secret =
    process.env.JWT_SECRET || "your_jwt_secret_change_this_in_production";

  try {
    return jwt.verify(token, secret);
  } catch (error) {
    throw new Error("Invalid token");
  }
};

export const hashPassword = async (password: string): Promise<string> => {
  const bcrypt = await import("bcryptjs");
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (
  password: string,
  hashedPassword: string,
): Promise<boolean> => {
  const bcrypt = await import("bcryptjs");
  return bcrypt.compare(password, hashedPassword);
};

export const generateAuthToken = async (
  email: string,
  userId: number,
): Promise<string> => {
  const jwt = await import("jsonwebtoken");
  const payload = {
    email,
    userId,
    type: "auth",
    iat: Math.floor(Date.now() / 1000),
  };

  const secret =
    process.env.JWT_SECRET || "your_jwt_secret_change_this_in_production";
  return jwt.sign(payload, secret);
};

export const validatePasswordStrength = (
  password: string,
): { isValid: boolean; message: string } => {
  if (!password || password.length < 6) {
    return {
      isValid: false,
      message: "Password must be at least 6 characters long",
    };
  }

  // Check for at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return {
      isValid: false,
      message: "Password must contain at least one uppercase letter",
    };
  }

  // Check for at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return {
      isValid: false,
      message: "Password must contain at least one lowercase letter",
    };
  }

  // Check for at least one number
  if (!/\d/.test(password)) {
    return {
      isValid: false,
      message: "Password must contain at least one number",
    };
  }

  return { isValid: true, message: "Password is strong" };
};

export const validateDateOfBirth = (
  dob: string,
): { isValid: boolean; message: string } => {
  console.log(
    "🔍 validateDateOfBirth - Input:",
    JSON.stringify(dob),
    "Type:",
    typeof dob,
    "Length:",
    dob.length,
  );

  // Check format YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  const regexMatch = dateRegex.test(dob);
  console.log(
    "🔍 validateDateOfBirth - Regex test result:",
    regexMatch,
    "for pattern:",
    dateRegex.toString(),
  );

  if (!regexMatch) {
    return {
      isValid: false,
      message: "Date of birth must be in YYYY-MM-DD format",
    };
  }

  const dobDate = new Date(dob);
  const today = new Date();

  // Check if it's a valid date
  if (isNaN(dobDate.getTime())) {
    return { isValid: false, message: "Invalid date of birth" };
  }

  // Check if date is not in the future
  if (dobDate > today) {
    return { isValid: false, message: "Date of birth cannot be in the future" };
  }

  // Check minimum age (13 years)
  const minDate = new Date();
  minDate.setFullYear(today.getFullYear() - 13);
  if (dobDate > minDate) {
    return { isValid: false, message: "User must be at least 13 years old" };
  }

  // Check maximum age (120 years)
  const maxDate = new Date();
  maxDate.setFullYear(today.getFullYear() - 120);
  if (dobDate < maxDate) {
    return { isValid: false, message: "Invalid date of birth" };
  }

  return { isValid: true, message: "Valid date of birth" };
};

export const validateName = (
  name: string,
): { isValid: boolean; message: string } => {
  if (!name || name.trim().length === 0) {
    return { isValid: false, message: "Name is required" };
  }

  if (name.trim().length < 2) {
    return {
      isValid: false,
      message: "Name must be at least 2 characters long",
    };
  }

  if (name.trim().length > 50) {
    return { isValid: false, message: "Name must not exceed 50 characters" };
  }

  // Check for valid characters (letters, numbers, underscores, dots, hyphens, apostrophes, spaces)
  const nameRegex = /^[a-zA-Z0-9\s\-'_.]+$/;
  if (!nameRegex.test(name.trim())) {
    return {
      isValid: false,
      message:
        "Name can only contain letters, numbers, spaces, underscores, dots, hyphens, and apostrophes",
    };
  }

  return { isValid: true, message: "Valid name" };
};

export const validateHeight = (
  height: number,
): { isValid: boolean; message: string } => {
  if (!height || isNaN(height)) {
    return { isValid: false, message: "Height must be a valid number" };
  }

  if (height < 50 || height > 300) {
    return { isValid: false, message: "Height must be between 50 and 300 cm" };
  }

  return { isValid: true, message: "Valid height" };
};

export const validateWeight = (
  weight: number,
): { isValid: boolean; message: string } => {
  if (!weight || isNaN(weight)) {
    return { isValid: false, message: "Weight must be a valid number" };
  }

  if (weight < 20 || weight > 500) {
    return { isValid: false, message: "Weight must be between 20 and 500 kg" };
  }

  return { isValid: true, message: "Valid weight" };
};

export const validateGender = (
  gender: string,
): { isValid: boolean; message: string } => {
  if (!gender || typeof gender !== "string") {
    return { isValid: false, message: "Gender is required" };
  }

  const validGenders = ["male", "female", "other"];
  const genderLowercase = gender.toLowerCase().trim();

  if (!validGenders.includes(genderLowercase)) {
    return {
      isValid: false,
      message: "Gender must be one of: male, female, other",
    };
  }

  return { isValid: true, message: "Valid gender" };
};

export const getUserFromToken = async (
  token: string,
): Promise<{ email: string; userId: number; type: string } | null> => {
  try {
    const decoded = await verifyToken(token);
    return {
      email: decoded.email,
      userId: decoded.userId,
      type: decoded.type,
    };
  } catch (error) {
    return null;
  }
};

export const isValidUrl = (url: string): boolean => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

export const validateImageUrls = (
  urls: string[],
  requiredCount: number,
  type: string,
): { isValid: boolean; message: string } => {
  // Check count
  if (urls.length !== requiredCount) {
    return {
      isValid: false,
      message: `Exactly ${requiredCount} ${type} photos are required. You provided ${urls.length}.`,
    };
  }

  // Validate each URL
  for (let i = 0; i < urls.length; i++) {
    if (!isValidUrl(urls[i])) {
      return {
        isValid: false,
        message: `Invalid URL format in ${type} photo ${i + 1}: ${urls[i]}`,
      };
    }
  }

  return { isValid: true, message: "Valid URLs" };
};

/**
 * Generate unique model ID
 */
export const generateModelId = (): string => {
  return `model_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Calculate age from DOB in yyyymmdd format (e.g., "19900115")
 */
export const calculateAge = (dob: string): number => {
  if (!dob) return 0;
  // console.log("calculateAge", dob);
  // Convert from YYYY-MM-DD → YYYYMMDD if needed
  if (dob.includes("-")) {
    dob = dob.replace(/-/g, "");
  }

  if (dob.length !== 8) return 0;

  const year = parseInt(dob.substring(0, 4), 10);
  const month = parseInt(dob.substring(4, 6), 10) - 1; // months are 0-indexed
  const day = parseInt(dob.substring(6, 8), 10);

  const birthDate = new Date(year, month, day);
  const today = new Date();

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();

  // Adjust if birthday hasn't occurred yet this year
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }

  return age;
};

/**
 * Save base64 image to file system
 * @param base64Data - Base64 string (with or without data URI prefix)
 * @param options - Options for saving (tryOn flag determines directory)
 * @returns The filename of the saved image
 */
export const saveBase64Image = (
  base64Data: string,
  options?: {
    tryOn?: boolean;
    angles?: boolean;
    backgroundRemoved?: boolean;
    cleanupAfterSeconds?: number;
  },
): string => {
  const fs = require("fs");
  const path = require("path");

  // Remove data URI prefix if present
  const base64Clean = base64Data.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Clean, "base64");

  // Determine output directory based on options
  let outputDir = "./generated-images";
  if (options?.tryOn) {
    outputDir = "./generated-images/try-on";
  } else if (options?.angles) {
    outputDir = "./generated-images/angles";
  } else if (options?.backgroundRemoved) {
    outputDir = "./generated-images/background-removed";
  }

  // Create directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Generate unique filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `image-${timestamp}.png`;
  const filePath = path.join(outputDir, fileName);

  // Write file
  fs.writeFileSync(filePath, buffer);

  if (
    options?.cleanupAfterSeconds &&
    Number.isFinite(options.cleanupAfterSeconds) &&
    options.cleanupAfterSeconds > 0
  ) {
    const cleanupDelayMs = options.cleanupAfterSeconds * 1000;
    setTimeout(() => {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          console.log(`🧹 Cleaned up local image: ${filePath}`);
        }
      } catch (cleanupError) {
        console.warn(`⚠️ Failed to cleanup local image ${filePath}:`, cleanupError);
      }
    }, cleanupDelayMs);
  }

  console.log(`✅ Saved image: ${filePath}`);
  return fileName;
};
