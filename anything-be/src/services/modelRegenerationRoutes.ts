import express from "express";
import { getUserFromToken } from "../helpers/utils";
import { User } from "../models/index";
import { modelGenerationUpload, validateFieldFiles } from "./fileUploadService";
import { regenerateModelForExistingUser } from "./modelGenerationService";

const router = express.Router();

// Regenerate model for existing user
router.post(
  "/regenerate-model",
  modelGenerationUpload,
  async (req, res) => {
    try {
      // Extract token from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          status: "Authentication required. Please provide a valid token.",
          modelId: null,
          modelPhoto: null,
        });
      }

      const token = authHeader.substring(7);
      const userFromToken = await getUserFromToken(token);

      if (!userFromToken) {
        return res.status(401).json({
          success: false,
          status: "Invalid or expired token",
          modelId: null,
          modelPhoto: null,
        });
      }

      console.log(
        `🔄 Model regeneration request from user ID: ${userFromToken.userId}`
      );

      // Validate that user exists
      const user = await User.findByPk(userFromToken.userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          status: "User not found",
          modelId: null,
          modelPhoto: null,
        });
      }

      // Validate uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      const validation = validateFieldFiles(files, {
        bodyPhotos: { min: 2, max: 6, required: true },
        facePhotos: { min: 0, max: 4, required: false },
      });

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          status: validation.message,
          modelId: null,
          modelPhoto: null,
        });
      }

      console.log(
        `📸 Validated uploads: ${files.bodyPhotos.length} body photos, ${
          files.facePhotos?.length || 0
        } face photos`
      );

      // Regenerate model
      try {
        const result = await regenerateModelForExistingUser(
          userFromToken.userId.toString(),
          files.bodyPhotos,
          files.facePhotos || []
        );

        console.log(
          `✅ Model regeneration completed for user ID: ${userFromToken.userId}`
        );

        return res.json({
          success: true,
          status: result.status,
          modelId: result.modelId,
          modelPhoto: result.modelPhoto,
        });
      } catch (regenerationError) {
        console.error("Error during model regeneration:", regenerationError);
        return res.status(500).json({
          success: false,
          status: `Model regeneration failed: ${
            regenerationError instanceof Error
              ? regenerationError.message
              : "Unknown error"
          }`,
          modelId: null,
          modelPhoto: null,
        });
      }
    } catch (error) {
      console.error("Error in regenerate-model endpoint:", error);
      return res.status(500).json({
        success: false,
        status: "Internal server error",
        modelId: null,
        modelPhoto: null,
      });
    }
  }
);

export default router;
