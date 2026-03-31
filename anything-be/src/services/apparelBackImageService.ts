import sharp from "sharp";
import { GoogleGenAI, Modality } from "@google/genai";
import { Apparel } from "../models/apparel.model";
import { removeBackgroundFromBase64 } from "./backgroundRemovalService";
import { gcsService } from "./gcsService";
import {
  BoundingBox,
  ClarifaiClothingDetectionService,
  ClothingRegion,
} from "./clarifai/clothing-detection";

const ai = new GoogleGenAI({
  apiKey:
    process.env.GEMINI_API_KEY || "AIzaSyB_m0qCgrF1GGFXnY7DmOEXHwDtnBVEhlY",
});

const clarifaiService = new ClarifaiClothingDetectionService();

interface ProcessBackImageInput {
  apparelId: number;
  userId: number;
  file: Express.Multer.File;
}

interface ProcessBackImageResult {
  apparelId: number;
  urlRawBack: string;
  urlProcessedBack: string;
  gsUtilRawBack: string;
  gsUtilProcessedBack: string;
}

const sanitizeFileName = (name: string): string =>
  name.replace(/[^a-zA-Z0-9._-]/g, "_");

const buildBackApparelPrompt = (
  apparelCategory: string,
  apparelSubcategory: string,
  targetConcept: string,
): string => {
  const isShoe = targetConcept === "shoe";
  const isOuterwear = targetConcept === "outerwear";
  const isOnePiece = targetConcept === "onePiece";

  if (isOuterwear) {
    return `Professional studio product photography for an e-commerce fashion label.

*Goal:* Generate a high-resolution, photorealistic image of a COMPLETE outerwear garment (jacket, coat, or blazer) as the sole subject, showing the ENTIRE piece from shoulder to hem in BACK VIEW.

*KNOWN GARMENT METADATA:*
- Category: ${apparelCategory}
- Subcategory: ${apparelSubcategory}
- Clarifai concept: ${targetConcept}

*OUTERWEAR-SPECIFIC REQUIREMENTS:*
- This is a standalone OUTER LAYER garment (jacket / coat / blazer / similar)
- Display it completely alone — NO inner shirt, blouse, t-shirt, or top visible underneath
- Show the GARMENT FROM THE BACK SIDE ONLY
- Preserve all back-side details: seams, back panels, hood, collar shape, pleats, yoke lines, back stitching, cuffs, hem structure

*CRITICAL IMAGE ORIENTATION - READ CAREFULLY:*
- Image Frame Dimensions: The final image MUST be PORTRAIT orientation where HEIGHT > WIDTH (taller than wide)
- Rotation: The image must have ZERO rotation — straight up and down
- Garment Position: Shoulders/collar at the TOP edge, hem at the BOTTOM edge
- The back side of the garment must face the camera directly

*COMPLETE VISIBILITY REQUIREMENT:*
- Show the ENTIRE garment from collar/shoulders to hem with adequate padding on all sides
- DO NOT crop any part — full sleeves, complete hem, full collar, complete width
- Include approximately 5–10% white space/padding around the garment on all sides

*Style & Presentation:*
- Garment completely UNFOLDED, LAID FLAT, showing the full BACK view
- Sleeves positioned naturally and relaxed (slightly angled downward, NOT fully extended)
- Garment maintains its natural shape as if on a mannequin — not stretched or distorted
- No model, body parts, or hangers visible
- Standard, uniform, bright, neutral studio lighting (high-key, soft shadows)
- Background must be light gray (#f0f0f0)

*Critical Requirements:*
- IMAGE DIMENSIONS: Height MUST be greater than width (portrait format)
- IMAGE ROTATION: ZERO degrees — the image must be UPRIGHT
- GARMENT ALIGNMENT: Collar/shoulders at TOP of image, hem at BOTTOM
- COMPLETE VISIBILITY: ENTIRE garment visible, NO parts cropped
- REMOVE ALL HANGERS: No hangers, hooks, or hanging apparatus
- BACK VIEW ONLY: Do NOT show the front side or convert it into a front-view product image

*FINAL CHECKLIST:*
✓ Image dimensions: Height > Width (portrait format)
✓ Image rotation: 0° (UPRIGHT)
✓ Collar/shoulders at the TOP of the image
✓ Hem at the BOTTOM of the image
✓ ENTIRE garment visible, NO parts cropped
✓ NO inner shirt or underlayer visible — outerwear only
✓ Full BACK view, completely unfolded
✗ NO front view
✗ NO inner clothing visible
✗ NO landscape/horizontal format
✗ NO cropping into garment
✗ NO hangers

*Focus on the outerwear provided in the reference image. Reproduce its exact style, color, pattern, material texture, and design details from the BACK side. Remove any person or hanger. Show ONLY the outer garment on the clean studio background.*

Return ONLY the final generated image in TRUE UPRIGHT PORTRAIT orientation showing the COMPLETE outerwear garment, fully unfolded, in BACK VIEW, with NO inner clothing visible and NO hangers.`;
  }

  if (isShoe) {
    return `Professional studio product photography for an e-commerce fashion label.

*Goal:* Generate a high-resolution, photorealistic image of a PAIR of shoes as the sole subject, based on the uploaded footwear image, preserving the exact design while presenting an appropriate REAR/BACK-SIDE product view.

*KNOWN GARMENT METADATA:*
- Category: ${apparelCategory}
- Subcategory: ${apparelSubcategory}
- Clarifai concept: ${targetConcept}

*CRITICAL CAMERA AND SHOE POSITIONING:*
- Generate a pair of matching shoes
- Show a BACK / REAR-ANGLE product view appropriate for footwear
- Both shoes must be placed ON THE GROUND with soles touching the ground
- The shoes should be positioned side by side in a clean studio setup
- Preserve heel shape, back tab, collar shape, sole structure, rear stitching, and material details

*ORIENTATION REQUIREMENTS:*
- Image Frame: The final image MUST be in UPRIGHT PORTRAIT orientation (taller than wide)
- Shoes Position: Both shoes standing upright on their soles
- Rear/back product view should face the camera clearly

*Style & Presentation:*
- Show BOTH shoes as a clean, complete pair
- Preserve exact style, pattern, color, and material texture from the reference image
- Use standard, uniform, bright, neutral studio lighting
- Background must be light gray (#f0f0f0)

*FINAL CHECKLIST - The generated image MUST show:*
✓ BOTH shoes visible (left and right)
✓ BOTH soles touching the ground
✓ Rear / back-oriented product presentation
✓ Image frame in UPRIGHT PORTRAIT orientation
✓ Clean studio product-photo styling
✗ NO model or body parts
✗ NO top-down view
✗ NO random front-view conversion if rear details are available

Return ONLY the final generated image in UPRIGHT PORTRAIT orientation showing a pair of shoes in a clean back/rear product view on a light gray studio background.`;
  }

  return `Professional studio product photography for an e-commerce fashion label.

*Goal:* Generate a high-resolution, photorealistic image of a COMPLETE "${apparelSubcategory}" garment as the sole subject, showing the ENTIRE garment from top to bottom in BACK VIEW.

*KNOWN GARMENT METADATA:*
- Category: ${apparelCategory}
- Subcategory: ${apparelSubcategory}
- Clarifai concept: ${targetConcept}

*CRITICAL IMAGE ORIENTATION - READ CAREFULLY:*
- Image Frame Dimensions: The final image MUST be PORTRAIT orientation where HEIGHT > WIDTH (taller than wide)
- Rotation: The image must have ZERO rotation - straight up and down
- Garment Position: The clothing item's TOP must be at the TOP edge of the image, and the BOTTOM must be at the BOTTOM edge
- The BACK side of the garment must face the camera directly

*COMPLETE VISIBILITY REQUIREMENT:*
- Show the ENTIRE garment from the very top to the very bottom with adequate margin/padding around all edges
- DO NOT crop into the garment - all parts must be fully visible
- Include reasonable white space/padding around the garment (approximately 5-10% on each side)

*Style & Presentation:*
- The clothing item must be presented COMPLETELY UNFOLDED and LAID FLAT, showing the full BACK view of the ENTIRE garment
- For tops/outerwear: sleeves positioned naturally and relaxed (slightly angled downward from shoulders, NOT fully extended)
- For bottoms: display full back side with waistband at top and legs/hem at bottom
- For dresses/one-piece garments: display full back side, completely unfolded, natural full-length silhouette
- No model or human body parts are visible
- Standard, uniform, bright, neutral studio lighting (high-key look)
- Background must be light gray (#f0f0f0)

*Critical Requirements:*
- IMAGE DIMENSIONS: Height MUST be greater than width (portrait format)
- IMAGE ROTATION: ZERO degrees rotation - the image must be UPRIGHT
- GARMENT ALIGNMENT: Top of garment at TOP of image, bottom at BOTTOM
- COMPLETE VISIBILITY: Show the ENTIRE garment with NO cropping
- BACK VIEW ONLY: Do NOT show front side details or convert to front view
- REMOVE ALL HANGERS: If a hanger is visible in the reference image, completely remove it
- Preserve all visible back-side details from the uploaded image: seams, stitching, closures, waistband, pleats, back cut lines, hem, silhouette

*FINAL CHECKLIST - The generated image MUST show:*
✓ Image dimensions: Height > Width (portrait format)
✓ Image rotation: 0° (UPRIGHT)
✓ Garment top at the TOP of the image
✓ Garment bottom at the BOTTOM of the image
✓ ENTIRE garment visible with NO parts cropped off
✓ Adequate padding/margin around all edges of the garment
✓ Full BACK view of complete garment
✓ Garment completely unfolded
✗ NO front view
✗ NO landscape/horizontal image format
✗ NO rotation left or right
✗ NO hangers visible

*Focus on the garment provided in the image. Reproduce its exact style, pattern, color, material texture, and design details from the BACK side only. Do not add anything beyond the garment. Remove any person or hanger.*

Return ONLY the final generated image in TRUE UPRIGHT PORTRAIT orientation (height > width, 0° rotation) with the COMPLETE item displayed in BACK VIEW, fully unfolded, with ENTIRE garment visible and NO hangers or human elements visible.`;
};

const mapApparelCategoryToClarifaiConcept = (
  category: string,
): "top" | "bottom" | "shoe" | "outerwear" | "onePiece" | null => {
  switch (category) {
    case "top":
      return "top";
    case "bottom":
      return "bottom";
    case "shoe":
      return "shoe";
    case "outerwear":
      return "outerwear";
    case "dress":
      return "onePiece";
    default:
      return null;
  }
};

const calculateBoundingBoxArea = (boundingBox: BoundingBox): number => {
  const width = boundingBox.rightCol - boundingBox.leftCol;
  const height = boundingBox.bottomRow - boundingBox.topRow;
  return width * height;
};

const selectBestMatchingRegion = (
  regions: ClothingRegion[],
  targetConcept: string,
): ClothingRegion | null => {
  const matchingRegions = regions
    .map((region) => {
      const matchingConcept = region.concepts.find(
        (concept) => concept.name === targetConcept,
      );

      if (!matchingConcept) {
        return null;
      }

      const area = calculateBoundingBoxArea(region.boundingBox);
      const score = matchingConcept.confidence * 0.6 + area * 100 * 0.4;

      return {
        region,
        confidence: matchingConcept.confidence,
        area,
        score,
      };
    })
    .filter(Boolean) as Array<{
    region: ClothingRegion;
    confidence: number;
    area: number;
    score: number;
  }>;

  if (matchingRegions.length === 0) {
    return null;
  }

  matchingRegions.sort((a, b) => b.score - a.score);
  return matchingRegions[0].region;
};

const cropImageToBoundingBox = async (
  imageBuffer: Buffer,
  boundingBox: BoundingBox,
): Promise<Buffer> => {
  const metadata = await sharp(imageBuffer).metadata();
  const imageWidth = metadata.width || 0;
  const imageHeight = metadata.height || 0;

  if (!imageWidth || !imageHeight) {
    throw new Error("Unable to determine image dimensions");
  }

  const left = Math.floor(boundingBox.leftCol * imageWidth);
  const top = Math.floor(boundingBox.topRow * imageHeight);
  const width = Math.floor(
    (boundingBox.rightCol - boundingBox.leftCol) * imageWidth,
  );
  const height = Math.floor(
    (boundingBox.bottomRow - boundingBox.topRow) * imageHeight,
  );

  const safeLeft = Math.max(0, left);
  const safeTop = Math.max(0, top);
  const safeWidth = Math.min(width, imageWidth - safeLeft);
  const safeHeight = Math.min(height, imageHeight - safeTop);

  if (safeWidth <= 0 || safeHeight <= 0) {
    throw new Error("Invalid bounding box dimensions from Clarifai detection");
  }

  return sharp(imageBuffer)
    .extract({
      left: safeLeft,
      top: safeTop,
      width: safeWidth,
      height: safeHeight,
    })
    .png()
    .toBuffer();
};

const extractImageFromResponse = (response: any): string => {
  if (!response?.candidates?.[0]?.content?.parts) {
    throw new Error("No response received from Gemini API");
  }

  for (const part of response.candidates[0].content.parts) {
    if (
      part.inlineData?.mimeType?.startsWith("image/") &&
      part.inlineData?.data
    ) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error("Gemini did not return an image");
};

const normalizeInputImage = async (
  file: Express.Multer.File,
): Promise<{ mimeType: string; base64: string }> => {
  try {
    const pngBuffer = await sharp(file.buffer).png().toBuffer();
    return {
      mimeType: "image/png",
      base64: pngBuffer.toString("base64"),
    };
  } catch {
    return {
      mimeType: file.mimetype || "image/jpeg",
      base64: file.buffer.toString("base64"),
    };
  }
};

export const processAndSaveApparelBackImage = async ({
  apparelId,
  userId,
  file,
}: ProcessBackImageInput): Promise<ProcessBackImageResult> => {
  const apparel = await Apparel.findOne({
    where: {
      id: apparelId,
      userId,
    },
  });

  if (!apparel) {
    throw new Error(
      "Apparel not found or you don't have permission to update it",
    );
  }

  const targetConcept = mapApparelCategoryToClarifaiConcept(apparel.category);
  if (!targetConcept) {
    throw new Error(
      `Back image generation is not supported for apparel category: ${apparel.category}`,
    );
  }

  const clarifaiResult = await clarifaiService.detectClothingFromBase64(
    file.buffer.toString("base64"),
  );

  if (!clarifaiResult.success) {
    throw new Error(
      clarifaiResult.message || "Clarifai detection failed for back image",
    );
  }

  const selectedRegion = selectBestMatchingRegion(
    clarifaiResult.regions,
    targetConcept,
  );

  if (!selectedRegion) {
    throw new Error(
      `No matching ${targetConcept} region found in uploaded back image`,
    );
  }

  const croppedBuffer = await cropImageToBoundingBox(
    file.buffer,
    selectedRegion.boundingBox,
  );

  const croppedBase64 = `data:image/png;base64,${croppedBuffer.toString("base64")}`;
  let rawBackBuffer = croppedBuffer;

  try {
    const bgRemovedCropped = await removeBackgroundFromBase64(croppedBase64, {
      background: "transparent",
    });
    const rawBase64Data = bgRemovedCropped.split(",")[1] || bgRemovedCropped;
    rawBackBuffer = Buffer.from(rawBase64Data, "base64");
  } catch (error) {
    console.warn(
      "Background removal failed for Clarifai-cropped back image, using cropped image as raw back image:",
      error,
    );
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const safeOriginalName = sanitizeFileName(
    file.originalname || "back-image.jpg",
  );

  const rawUpload = await gcsService.uploadFile(
    rawBackBuffer,
    `apparel-${apparelId}-back-raw-${timestamp}-${safeOriginalName.replace(/\.[^.]+$/, "")}.png`,
    userId.toString(),
    "AddOutfit/BackRaw",
    "image/png",
  );

  const normalizedInput = await normalizeInputImage({
    ...file,
    buffer: rawBackBuffer,
    mimetype: "image/png",
  } as Express.Multer.File);

  const prompt = buildBackApparelPrompt(
    apparel.category,
    apparel.subcategory,
    targetConcept,
  );

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      { text: prompt },
      {
        inlineData: {
          mimeType: normalizedInput.mimeType,
          data: normalizedInput.base64,
        },
      },
    ],
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  const generatedDataUrl = extractImageFromResponse(response);

  const bgRemovedDataUrl = await removeBackgroundFromBase64(generatedDataUrl, {
    background: "transparent",
  });

  const processedUpload = await gcsService.uploadBase64Image(
    bgRemovedDataUrl,
    `apparel-${apparelId}-back-processed-${timestamp}.png`,
    userId.toString(),
    "AddOutfit/BackProcessed",
    "image/png",
  );

  await apparel.update({
    urlRawBack: rawUpload.httpUrl,
    gsUtilRawBack: rawUpload.gsUri,
    urlProcessedBack: processedUpload.httpUrl,
    gsUtilProcessedBack: processedUpload.gsUri,
  });

  return {
    apparelId,
    urlRawBack: rawUpload.httpUrl,
    urlProcessedBack: processedUpload.httpUrl,
    gsUtilRawBack: rawUpload.gsUri,
    gsUtilProcessedBack: processedUpload.gsUri,
  };
};
