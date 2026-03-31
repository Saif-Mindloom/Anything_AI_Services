import { Router, Request, Response } from "express";
import { generateApparelDescription } from "../services/openai/apparelDescriptionService";

const router = Router();

/**
 * POST /api/v1/test/apparel-description
 * Temporary test endpoint — no auth required.
 * Body: { "imageUrl": "https://..." }
 */
router.post("/test/apparel-description", async (req: Request, res: Response) => {
  const { imageUrl } = req.body;

  if (!imageUrl || typeof imageUrl !== "string") {
    return res.status(400).json({
      success: false,
      message: 'Missing or invalid "imageUrl" in request body.',
    });
  }

  try {
    const result = await generateApparelDescription(imageUrl);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("❌ Test apparel-description error:", error);
    return res.status(500).json({
      success: false,
      message: error?.message || "Failed to generate apparel description.",
    });
  }
});

export default router;
