import express from "express";
import * as fs from "fs";
import multer from "multer";
import * as path from "path";
import { generateVirtualTryOnImageLocal } from "./gemini/services";
import { saveBase64Image } from "../helpers/utils";

const router = express.Router();

// Configure multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Check if the file is an image
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed!") as any, false);
    }
  },
});

// Test Gemini with outfit - virtual try-on
router.post(
  "/test-gemini-outfit",
  upload.fields([
    { name: "modelImage", maxCount: 1 },
    { name: "garmentImage", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      // Check if both files are uploaded
      if (!files.modelImage || !files.garmentImage) {
        return res.status(400).json({
          success: false,
          message:
            "Both model image and garment image are required. Please upload both files.",
        });
      }

      const modelFile = files.modelImage[0];
      const garmentFile = files.garmentImage[0];

      // Validate file types
      if (
        !modelFile.mimetype.startsWith("image/") ||
        !garmentFile.mimetype.startsWith("image/")
      ) {
        return res.status(400).json({
          success: false,
          message: "Both files must be images. Only image files are allowed.",
        });
      }

      console.log(
        `Generating virtual try-on image from uploaded files: ${modelFile.originalname} + ${garmentFile.originalname}`
      );

      // Save uploaded files temporarily for processing
      const tempDir = "./temp-uploads";
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const modelImagePath = path.join(
        tempDir,
        `model_${Date.now()}_${modelFile.originalname}`
      );
      const garmentImagePath = path.join(
        tempDir,
        `garment_${Date.now()}_${garmentFile.originalname}`
      );

      fs.writeFileSync(modelImagePath, modelFile.buffer);
      fs.writeFileSync(garmentImagePath, garmentFile.buffer);

      try {
        const finalImage = await generateVirtualTryOnImageLocal(
          modelImagePath,
          garmentImagePath
        );

        const savedFileName = saveBase64Image(finalImage, {
          tryOn: true,
          cleanupAfterSeconds: parseInt(
            process.env.LOCAL_IMAGE_CLEANUP_TTL_SECONDS || "3600",
            10
          ),
        });

        res.json({
          success: true,
          message: "Virtual try-on image generated successfully",
          imageBase64: finalImage,
          savedFileName: savedFileName,
          downloadUrl: `/api/v1/download-generated/${savedFileName}`,
          modelFileName: modelFile.originalname,
          garmentFileName: garmentFile.originalname,
        });
      } finally {
        // Clean up temporary files
        if (fs.existsSync(modelImagePath)) {
          fs.unlinkSync(modelImagePath);
        }
        if (fs.existsSync(garmentImagePath)) {
          fs.unlinkSync(garmentImagePath);
        }
      }
    } catch (error) {
      console.error("Error generating virtual try-on image:", error);
      res.status(500).json({
        success: false,
        message: `Error: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  }
);

export default router;
