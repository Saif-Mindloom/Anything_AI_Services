import express from "express";
import * as fs from "fs";
import * as path from "path";
import { getUserFromToken } from "../helpers/utils";
import { generateModelAngles } from "../services/gemini/services";

const router = express.Router();

// Test endpoint: Generate multiple angle views from a model image
router.post("/test-generate-model-angles", async (req, res) => {
  try {
    // Authentication
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

    // Get the model image URL from request body
    const { modelImageUrl } = req.body;

    if (!modelImageUrl) {
      return res.status(400).json({
        success: false,
        message: "modelImageUrl is required in the request body",
      });
    }

    console.log(
      `Starting test generation of multiple angles for user: ${userFromToken.userId}`
    );

    // Generate all angle views
    const angleResults = await generateModelAngles(modelImageUrl);

    // Process results and save images
    const angles = [];
    let totalGenerated = 0;

    for (const [degree, base64Result] of Object.entries(angleResults)) {
      if (base64Result && base64Result.trim() !== "") {
        try {
          // Save the generated image
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const fileName = `test-model-angle-${degree}deg-${timestamp}.png`;

          // Save to angles directory
          const outputDir = "./generated-images/angles";
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          const base64Data = base64Result.replace(
            /^data:image\/\w+;base64,/,
            ""
          );
          const buffer = Buffer.from(base64Data, "base64");
          const filePath = path.join(outputDir, fileName);
          fs.writeFileSync(filePath, buffer);

          const cleanupAfterSeconds = parseInt(
            process.env.LOCAL_IMAGE_CLEANUP_TTL_SECONDS || "3600",
            10
          );
          if (Number.isFinite(cleanupAfterSeconds) && cleanupAfterSeconds > 0) {
            setTimeout(() => {
              try {
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                  console.log(`🧹 Cleaned up local test angle image: ${filePath}`);
                }
              } catch (cleanupError) {
                console.warn(
                  `⚠️ Failed to cleanup local test angle image ${filePath}:`,
                  cleanupError
                );
              }
            }, cleanupAfterSeconds * 1000);
          }

          console.log(`Saved ${degree}° angle image: ${filePath}`);

          angles.push({
            angle: `${degree} degrees`,
            imageBase64: base64Result,
            success: true,
            error: null,
          });
          totalGenerated++;
        } catch (saveError) {
          console.error(`❌ Error saving ${degree}° angle image:`, saveError);
          angles.push({
            angle: `${degree} degrees`,
            imageBase64: "",
            success: false,
            error: `Failed to save image: ${
              saveError instanceof Error ? saveError.message : "Unknown error"
            }`,
          });
        }
      } else {
        angles.push({
          angle: `${degree} degrees`,
          imageBase64: "",
          success: false,
          error: "Failed to generate image for this angle",
        });
      }
    }

    const successMessage =
      totalGenerated === 5
        ? "All test angle views generated successfully"
        : `${totalGenerated} out of 5 test angle views generated successfully`;

    console.log(
      `🎉 Test generation complete: ${totalGenerated}/5 angles generated`
    );

    res.json({
      success: totalGenerated > 0,
      message: successMessage,
      angles,
      totalGenerated,
    });
  } catch (error) {
    console.error("Error in test-generate-model-angles:", error);
    res.status(500).json({
      success: false,
      message: `Error generating test model angles: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      angles: [],
      totalGenerated: 0,
    });
  }
});

export default router;
