import express from "express";
import { getUserFromToken } from "../helpers/utils";
import { singleImageUpload } from "../services/fileUploadService";
import { processAndSaveApparelBackImage } from "../services/apparelBackImageService";

const router = express.Router();

router.post(
  "/apparels/:apparelId/back-image",
  singleImageUpload,
  async (req, res) => {
    try {
      const authHeader = req.headers?.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          message: "Authentication required. Please provide a valid token.",
        });
      }

      const token = authHeader.substring(7);
      const userFromToken = await getUserFromToken(token);

      if (!userFromToken) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token",
        });
      }

      const apparelId = Number(req.params.apparelId);
      if (!apparelId || Number.isNaN(apparelId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid apparelId",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message:
            "No image file uploaded. Please upload an image in field 'image'.",
        });
      }

      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({
          success: false,
          message: "Uploaded file must be an image.",
        });
      }

      const result = await processAndSaveApparelBackImage({
        apparelId,
        userId: userFromToken.userId,
        file: req.file,
      });

      return res.status(200).json({
        success: true,
        message: "Apparel back image processed and saved successfully",
        data: result,
      });
    } catch (error) {
      console.error("Error processing apparel back image:", error);
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to process apparel back image",
      });
    }
  },
);

export default router;
