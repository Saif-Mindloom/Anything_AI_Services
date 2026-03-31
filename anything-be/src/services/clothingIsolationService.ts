import { GoogleGenAI, Modality } from "@google/genai";
import sharp from "sharp";
import { gcsService } from "./gcsService";
import { CroppedImage } from "./clothingDetectionCropService";
import { removeBackgroundFromBase64 } from "./backgroundRemovalService";

// ============================================
// Category-specific canvas sizes for standardization
// ============================================
const CATEGORY_CANVAS_SIZES: Record<string, { width: number; height: number }> =
  {
    top: { width: 800, height: 960 },
    bottom: { width: 800, height: 1120 },
    dress: { width: 800, height: 1200 },
    shoe: { width: 900, height: 900 },
    other: { width: 800, height: 960 },
  };

function getCanvasSizeForConcept(conceptName: string): {
  width: number;
  height: number;
} {
  const name = conceptName.toLowerCase();

  if (
    name.includes("dress") ||
    name.includes("gown") ||
    name.includes("jumpsuit")
  ) {
    return CATEGORY_CANVAS_SIZES.dress;
  }

  if (
    name.includes("pants") ||
    name.includes("jeans") ||
    name.includes("shorts") ||
    name.includes("skirt") ||
    name.includes("trouser") ||
    name.includes("bottom") ||
    name.includes("legging")
  ) {
    return CATEGORY_CANVAS_SIZES.bottom;
  }

  if (
    name.includes("shoe") ||
    name.includes("sneaker") ||
    name.includes("boot") ||
    name.includes("sandal") ||
    name.includes("heel") ||
    name.includes("footwear")
  ) {
    return CATEGORY_CANVAS_SIZES.shoe;
  }

  if (
    name.includes("top") ||
    name.includes("shirt") ||
    name.includes("blouse") ||
    name.includes("t-shirt") ||
    name.includes("sweater") ||
    name.includes("hoodie") ||
    name.includes("jacket") ||
    name.includes("coat") ||
    name.includes("blazer") ||
    name.includes("outerwear")
  ) {
    return CATEGORY_CANVAS_SIZES.top;
  }

  return CATEGORY_CANVAS_SIZES.other;
}

/**
 * Standardize a background-removed garment image to a category-specific canvas.
 *
 * Steps:
 *  1. Scan for non-transparent pixels to find the tight garment bounding box.
 *  2. Expand the bounding box by 5% padding on all sides.
 *  3. Crop to that padded region.
 *  4. Resize to fit inside the category canvas while preserving aspect ratio.
 *  5. Composite centered on the category canvas (transparent background).
 */
async function standardizeClothingImage(
  imageBuffer: Buffer,
  conceptName: string,
): Promise<Buffer> {
  try {
    const { width: targetWidth, height: targetHeight } =
      getCanvasSizeForConcept(conceptName);

    console.log(
      `📐 [STANDARDIZE] Standardizing "${conceptName}" → ${targetWidth}x${targetHeight} canvas`,
    );

    const { data, info } = await sharp(imageBuffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Find tight bounding box of visible (non-transparent) garment pixels
    let minX = info.width;
    let minY = info.height;
    let maxX = 0;
    let maxY = 0;

    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const alpha = data[(y * info.width + x) * info.channels + 3];
        if (alpha > 25) {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }

    if (minX >= maxX || minY >= maxY) {
      console.warn(
        `⚠️ [STANDARDIZE] No visible garment pixels found for "${conceptName}", skipping standardization`,
      );
      return imageBuffer;
    }

    const garmentWidth = maxX - minX;
    const garmentHeight = maxY - minY;

    console.log(
      `   Garment bounds: ${garmentWidth}x${garmentHeight} at (${minX}, ${minY})`,
    );

    // 5% padding relative to the larger garment dimension
    const padding = Math.max(garmentWidth, garmentHeight) * 0.05;
    const cropLeft = Math.max(0, Math.floor(minX - padding));
    const cropTop = Math.max(0, Math.floor(minY - padding));
    const cropWidth = Math.min(
      Math.ceil(garmentWidth + padding * 2),
      info.width - cropLeft,
    );
    const cropHeight = Math.min(
      Math.ceil(garmentHeight + padding * 2),
      info.height - cropTop,
    );

    console.log(
      `   Crop with padding: ${cropWidth}x${cropHeight} at (${cropLeft}, ${cropTop})`,
    );

    const croppedBuffer = await sharp(imageBuffer)
      .extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
      .toBuffer();

    // Fit inside target canvas maintaining aspect ratio
    const resizedBuffer = await sharp(croppedBuffer)
      .resize(targetWidth, targetHeight, {
        fit: "inside",
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .toBuffer();

    const resizedMeta = await sharp(resizedBuffer).metadata();
    const resizedWidth = resizedMeta.width ?? 0;
    const resizedHeight = resizedMeta.height ?? 0;

    const offsetX = Math.round((targetWidth - resizedWidth) / 2);
    const offsetY = Math.round((targetHeight - resizedHeight) / 2);

    console.log(
      `   Placing ${resizedWidth}x${resizedHeight} at (${offsetX}, ${offsetY}) on ${targetWidth}x${targetHeight} canvas`,
    );

    const standardizedBuffer = await (sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      },
    }) as any)
      .composite([{ input: resizedBuffer, left: offsetX, top: offsetY }])
      .png()
      .toBuffer();

    console.log(
      `✅ [STANDARDIZE] "${conceptName}" standardized to ${targetWidth}x${targetHeight}`,
    );

    return standardizedBuffer;
  } catch (error) {
    console.error(
      `⚠️ [STANDARDIZE] Failed for "${conceptName}", using original:`,
      error,
    );
    return imageBuffer;
  }
}

export interface IsolatedClothingItem {
  regionId: number;
  conceptName: string;
  originalConfidence: number;
  description: string;
  isolatedImageUrl: string;
  isolatedFileName: string;
  originalCroppedUrl: string;
  success: boolean;
  error?: string;
}

export interface ClothingIsolationResult {
  success: boolean;
  message: string;
  totalProcessed: number;
  isolatedItems: IsolatedClothingItem[];
  originalFileName: string;
}

// Initialize Google AI client
const ai = new GoogleGenAI({
  apiKey: "AIzaSyB_m0qCgrF1GGFXnY7DmOEXHwDtnBVEhlY", // Should be moved to env variables
});

const model = "gemini-2.5-flash-image";

/**
 * Convert buffer to Gemini part for API consumption
 */
function bufferToPart(
  buffer: Buffer,
  mimeType: string = "image/png",
): { inlineData: { mimeType: string; data: string } } {
  const base64Data = buffer.toString("base64");
  return { inlineData: { mimeType, data: base64Data } };
}

/**
 * Handle Gemini API response and extract image
 */
function handleApiResponse(response: any): string {
  if (!response?.candidates?.[0]?.content?.parts) {
    throw new Error("No response received from Gemini API");
  }

  const parts = response.candidates[0].content.parts;

  // Find image part
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      const mimeType = part.inlineData.mimeType;
      const data = part.inlineData.data;
      return `data:${mimeType};base64,${data}`;
    }
  }

  // Handle finish reason
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    throw new Error(
      `Image generation stopped unexpectedly. Reason: ${finishReason}. This often relates to safety settings.`,
    );
  }

  throw new Error(
    "The AI model did not return an image. This can happen due to safety filters or if the request is too complex.",
  );
}

/**
 * Download image from URL (handles S3 URLs by generating signed URLs)
 */
async function downloadImageFromUrl(imageUrl: string): Promise<Buffer> {
  try {
    // Direct fetch since bucket is public
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (error) {
    throw new Error(
      `Error downloading image: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Generate isolated clothing image using Gemini
 */
async function generateIsolatedClothing(
  croppedImageBuffer: Buffer,
  conceptName: string,
): Promise<{ isolatedImage: string; description: string }> {
  const imagePart = bufferToPart(croppedImageBuffer, "image/png");

  const lowerConceptName = conceptName.toLowerCase();

  // Check if the item is a shoe/footwear to generate a pair
  const isShoe =
    lowerConceptName.includes("shoe") ||
    lowerConceptName.includes("sneaker") ||
    lowerConceptName.includes("boot") ||
    lowerConceptName.includes("sandal") ||
    lowerConceptName.includes("heel") ||
    lowerConceptName.includes("footwear");

  const isOuterwear = lowerConceptName === "outerwear";

  //   const prompt = `You are an expert fashion AI. Looking at this cropped clothing item image that shows a "${conceptName}", I need you to:

  // 1. **Remove the person/model:** Create a clean, isolated image of ONLY the clothing item, completely removing any person wearing it, body parts, or human elements.

  // 2. **Professional presentation:** Present the clothing item as if it's a high-quality product photo for an e-commerce website - clean, well-lit, and professionally styled.

  // 3. **Maintain the clothing:** Preserve the exact style, pattern, color, texture, and design details of the clothing item.

  // 4. **Clean background:** Use a clean, neutral background (preferably white or light gray).

  // **Important:** Return ONLY the isolated clothing image. The image should contain only the clothing item on a clean background, as if it were a professional product photo.

  // Generate the clean, isolated product image now.`;

  const outerwearPrompt = `Professional studio product photography for an e-commerce fashion label.

*Goal:* Generate a high-resolution, photorealistic image of a COMPLETE outerwear garment (jacket, coat, or blazer) as the sole subject, showing the ENTIRE piece from shoulder to hem.

*OUTERWEAR-SPECIFIC REQUIREMENTS:*
- This is a standalone OUTER LAYER garment (jacket / coat / blazer / similar)
- Display it completely alone — NO inner shirt, blouse, t-shirt, or top visible underneath
- The collar, lapels, and inside lining may be visible but must show NO underlayer clothing
- Show all defining details: buttons, zippers, pockets, cuffs, seams, and any lining at collar/cuffs

*CRITICAL IMAGE ORIENTATION - READ CAREFULLY:*
- Image Frame Dimensions: The final image MUST be PORTRAIT orientation where HEIGHT > WIDTH (taller than wide)
- Rotation: The image must have ZERO rotation — straight up and down
- Garment Position: Shoulders/collar at the TOP edge, hem at the BOTTOM edge
- Gravity Direction: The garment should hang naturally from top to bottom

*COMPLETE VISIBILITY REQUIREMENT:*
- Show the ENTIRE garment from collar/shoulders to hem with adequate padding on all sides
- DO NOT crop any part — full sleeves, complete hem, full collar/lapels, complete width
- Include approximately 5–10% white space/padding around the garment on all sides

*Style & Presentation:*
- Garment completely UNFOLDED, LAID FLAT, showing the full front view
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

*FINAL CHECKLIST:*
✓ Image dimensions: Height > Width (portrait format)
✓ Image rotation: 0° (UPRIGHT)
✓ Collar/shoulders at the TOP of the image
✓ Hem at the BOTTOM of the image
✓ ENTIRE garment visible, NO parts cropped
✓ NO inner shirt or underlayer visible — outerwear only
✓ Adequate padding on all edges
✓ Full front view, completely unfolded
✗ NO inner clothing visible
✗ NO landscape/horizontal format
✗ NO cropping into garment
✗ NO hangers

*Focus on the outerwear provided in the reference image. Reproduce its exact style, color, pattern, material texture, and design details. Remove any person or hanger. Show ONLY the outer garment on the clean studio background.*

Return ONLY the final generated image in TRUE UPRIGHT PORTRAIT orientation showing the COMPLETE outerwear garment, fully unfolded, with NO inner clothing visible and NO hangers.`;

  const prompt = isOuterwear
    ? outerwearPrompt
    : isShoe
    ? `Professional studio product photography for an e-commerce fashion label.

*Goal:* Generate a high-resolution, photorealistic image of a PAIR of "${conceptName}s" as the sole subject.

*CRITICAL CAMERA AND SHOE POSITIONING:*
- Camera Position: Position the camera at eye-level, looking at the shoes from a LEFT-CENTER angle (approximately 30-45 degrees from the left side)
- Shoe Placement: Both shoes must be placed ON THE GROUND with their SOLES TOUCHING THE GROUND/FLOOR
- Shoe Arrangement: Place shoes SIDE BY SIDE (left shoe on the left, right shoe on the right), parallel to each other or slightly angled inward
- What the camera sees: Looking at the shoes from the left-center angle, you should see the LEFT SIDE and partial FRONT of both shoes
- BOTH SOLES MUST BE DOWN: The bottom/sole of each shoe must be touching the ground - NOT facing each other, NOT in top-down view, NOT upside down

*ORIENTATION REQUIREMENTS:*
- Image Frame: The final image MUST be in UPRIGHT PORTRAIT orientation (taller than wide)
- Shoes Position: Both shoes standing upright on their soles, as if someone just took them off and placed them on the floor side by side
- Viewing Angle: LEFT-CENTER perspective showing the left side and partial front of the shoes
- NO top-down view, NO birds-eye view, NO soles facing each other, NO soles visible to camera

*Style & Presentation:*
•⁠  ⁠*Footwear Focus:* Show BOTH shoes (complete pair) positioned naturally on the ground, side by side, with soles down. The left-center camera angle reveals the left side profile and partial front of both shoes.
•⁠  ⁠*Consistency:* The style, pattern, color, material texture, and all design details of BOTH shoes must strictly match the provided reference image. Both shoes should be identical in design, just mirrored left/right.
•⁠  ⁠*Lighting:* Use standard, uniform, bright, neutral studio lighting (high-key look). The light should be soft and shadowless/minimally shadowed to clearly show all material details and textures.
•⁠  ⁠*Background:* The background must be light gray (#f0f0f0).

*FINAL CHECKLIST - The generated image MUST show:*
✓ BOTH shoes visible (left and right)
✓ BOTH soles touching the ground (soles DOWN, not visible, not facing each other)
✓ Shoes placed SIDE BY SIDE on the ground
✓ Camera viewing from LEFT-CENTER angle (30-45 degrees from left)
✓ Image frame in UPRIGHT PORTRAIT orientation
✓ Shoes standing naturally as if placed on floor
✓ Left side and partial front of shoes visible
✗ NO top-down view
✗ NO soles facing each other
✗ NO sideways/landscape orientation
✗ NO birds-eye view

*Think of this scene: Two shoes are placed side by side on a photography studio floor. You are standing to the LEFT of the shoes, looking at them from a slight angle (30-45 degrees). You see the left side and front of both shoes. The camera is held upright in portrait mode. This is the view to generate.*

Return ONLY the final generated image in UPRIGHT PORTRAIT orientation showing a pair of shoes with SOLES DOWN on the ground, viewed from a LEFT-CENTER angle.`
    : `Professional studio product photography for an e-commerce fashion label.

*Goal:* Generate a high-resolution, photorealistic image of a COMPLETE "${conceptName}" as the sole subject, showing the ENTIRE garment from top to bottom.

*CRITICAL IMAGE ORIENTATION - READ CAREFULLY:*
- Image Frame Dimensions: The final image MUST be PORTRAIT orientation where HEIGHT > WIDTH (taller than wide)
- Rotation: The image must have ZERO rotation - straight up and down, NOT rotated 90 degrees left, NOT rotated 90 degrees right
- Garment Position: The clothing item's TOP (collar/neckline/shoulders) must be at the TOP edge of the image, and the BOTTOM (hem) must be at the BOTTOM edge
- Gravity Direction: Imagine gravity pulling downward in the image - the garment should hang naturally from top to bottom
- Reference: If you were to display this image on a phone held VERTICALLY (portrait mode), the garment should appear upright without needing to rotate the phone

*COMPLETE VISIBILITY REQUIREMENT:*
- Show the ENTIRE garment from the very top to the very bottom with adequate margin/padding around all edges
- DO NOT crop into the garment - all parts must be fully visible (full sleeves, complete hem, full collar/neckline, complete width)
- Include reasonable white space/padding around the garment (approximately 5-10% on each side)
- The full garment must fit comfortably within the frame without any part being cut off

*Style & Presentation:*
•⁠  ⁠*Garment Focus:* The clothing item must be presented COMPLETELY UNFOLDED and LAID FLAT, showing the full front view of the ENTIRE garment. For shirts and tops, display them with sleeves positioned naturally and relaxed (slightly angled downward from shoulders, NOT fully extended to sides). The garment should maintain its natural shape as if displayed on a mannequin viewed from the front - not stretched or distorted. The garment should look ready to wear, not folded or creased. No model or human body parts are visible.
•⁠  ⁠*Orientation:* The clothing item MUST be displayed in TRUE PORTRAIT orientation (image height > image width) with the garment standing UPRIGHT. CRITICAL: The image must NOT be rotated 90 degrees to the left or right. The garment's top (collar/neckline/shoulders) must point toward the TOP edge of the image frame, and the bottom (hem) must point toward the BOTTOM edge of the image frame. If someone views this image on a vertically-held phone, the garment should appear correctly oriented without rotating the phone.
•⁠  ⁠*Consistency:* The style, pattern, color, material texture, and all design details of the clothing item must strictly match the provided reference image. Prioritize the visual details from the reference image over the text description.
•⁠  ⁠*Lighting:* Use standard, uniform, bright, neutral studio lighting (high-key look). The light should be soft and shadowless/minimally shadowed to clearly show all fabric details.
•⁠  ⁠*Background:* The background must be light gray (#f0f0f0).

*Critical Requirements:*
- IMAGE DIMENSIONS: Height MUST be greater than width (portrait format, e.g., 1080x1920, not 1920x1080)
- IMAGE ROTATION: ZERO degrees rotation - the image must be UPRIGHT, NOT rotated 90° left or right
- GARMENT ALIGNMENT: Top of garment (collar/neckline/shoulders/waistband) at TOP of image, bottom of garment (hem) at BOTTOM of image
- COMPLETE VISIBILITY: Show the ENTIRE garment with NO cropping - full sleeves, complete hem, full collar, complete width
- PADDING: Include margin space around the garment (5-10% on all sides) so nothing is cut off
- For shirts/tops: Display completely unfolded with sleeves in natural, relaxed position (slightly angled down). Maintain natural proportions. COLLAR/NECKLINE at the TOP of the image frame.
- For pants/bottoms: Display fully extended vertically in natural shape, not folded. WAISTBAND at the TOP of the image frame.
- For dresses: Display full length in natural shape, completely unfolded. NECKLINE/SHOULDERS at the TOP of the image frame.
- GARMENT MUST BE VERTICAL IN THE IMAGE: If the garment were a real object, it should appear as if hanging naturally from top to bottom with gravity
- Natural shape: Preserve the garment's actual proportions
- No creases, folds, or bunching - the garment should appear smooth and ready to wear
- REMOVE ALL HANGERS: If a hanger is visible in the reference image, completely remove it. Show ONLY the clothing item without any hangers, hooks, clips, or hanging apparatus.

*FINAL CHECKLIST - The generated image MUST show:*
✓ Image dimensions: Height > Width (portrait format)
✓ Image rotation: 0° (UPRIGHT, not rotated left or right)
✓ Garment top (collar/neckline/waistband) at the TOP of the image
✓ Garment bottom (hem) at the BOTTOM of the image
✓ ENTIRE garment visible with NO parts cropped off
✓ Adequate padding/margin around all edges of the garment
✓ Full front view of complete garment
✓ Garment completely unfolded
✗ NO landscape/horizontal image format (width > height)
✗ NO 90° rotation (left or right)
✗ NO cropping into the garment
✗ NO parts of the garment cut off
✗ NO hangers visible

*Visual Guide: Imagine a t-shirt. The collar should be at the top of your image, the hem at the bottom. The sleeves should extend left and right. If you need to tilt your head or rotate your screen to see the shirt right-side-up, the orientation is WRONG.*

*Focus on the "${conceptName}" provided in the image. Do not add anything to the image beyond the ${conceptName}. If hangers are present in the reference image, remove them completely.*

Return ONLY the final generated image in TRUE UPRIGHT PORTRAIT orientation (height > width, 0° rotation) with the COMPLETE item displayed VERTICALLY (top at top, bottom at bottom) in its natural shape, fully unfolded, with ENTIRE garment visible and NO hangers or hanging apparatus visible.`;

  try {
    // Step 1: Generate isolated image
    const imageResponse = await ai.models.generateContent({
      model: model,
      contents: { parts: [imagePart, { text: prompt }] },
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    const isolatedImage = handleApiResponse(imageResponse);

    // Use fallback description (Gemini text analysis removed due to model availability)
    const description = generateDescription(conceptName);

    return {
      isolatedImage,
      description,
    };
  } catch (error) {
    throw new Error(
      `Failed to generate isolated clothing: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

/**
 * Generate a description based on concept name
 * Provides consistent, high-quality descriptions for clothing items
 */
function generateDescription(conceptName: string): string {
  const descriptions: { [key: string]: string } = {
    top: "A stylish top garment featuring contemporary design elements",
    shirt: "A well-fitted shirt with classic styling and modern appeal",
    blouse: "An elegant blouse with feminine details and flattering cut",
    "t-shirt": "A comfortable t-shirt with casual styling and versatile design",
    tank: "A sleeveless tank top with a modern fit and clean lines",
    sweater: "A cozy sweater with textured knit and comfortable styling",
    cardigan: "A sophisticated cardigan with button-front closure",
    outerwear: "A stylish outerwear piece — jacket, coat, or blazer — with tailored construction and contemporary design",
    jacket: "A structured jacket with tailored details and contemporary fit",
    coat: "An outerwear coat with protective design and stylish elements",
    dress: "A beautiful dress with flattering silhouette and elegant details",
    skirt: "A stylish skirt with modern cut and versatile styling",
    pants: "Well-tailored pants with comfortable fit and contemporary design",
    jeans: "Classic denim jeans with modern styling and comfortable fit",
    shorts: "Casual shorts with comfortable fit and versatile design",
    leggings:
      "Form-fitting leggings with stretchy material and athletic styling",
    shoes:
      "A stylish pair of shoes with contemporary design and comfortable construction",
    sneakers:
      "A pair of athletic sneakers with modern design and performance features",
    boots:
      "A pair of fashionable boots with durable construction and stylish details",
    sandals:
      "A pair of comfortable sandals with open design and summer styling",
    heels: "A pair of elegant heeled shoes with sophisticated design elements",
    hat: "A fashionable hat with stylish design and functional appeal",
    cap: "A casual cap with modern styling and comfortable fit",
    bag: "A practical bag with contemporary design and functional features",
    handbag:
      "An elegant handbag with sophisticated styling and quality construction",
    backpack: "A functional backpack with modern design and practical features",
    belt: "A stylish belt with quality construction and versatile design",
    scarf: "A fashionable scarf with soft material and elegant draping",
    jewelry: "Elegant jewelry piece with sophisticated design elements",
    earrings: "Stylish earrings with contemporary design and elegant appeal",
    necklace:
      "A beautiful necklace with sophisticated styling and quality craftsmanship",
    bracelet: "An elegant bracelet with modern design and comfortable wear",
    watch:
      "A stylish timepiece with contemporary design and functional features",
  };

  return (
    descriptions[conceptName.toLowerCase()] ||
    `A stylish ${conceptName} with contemporary design and modern appeal`
  );
}

/**
 * Convert base64 data URL to buffer
 */
function dataUrlToBuffer(dataUrl: string): Buffer {
  const base64Data = dataUrl.split(",")[1];
  return Buffer.from(base64Data, "base64");
}

/**
 * Check if image needs rotation correction using pure dimension-based heuristics
 * Returns base64 data URL of corrected image, or original if no correction needed
 * NO LLM/AI calls - completely free and fast
 */
async function correctImageRotation(
  dataUrl: string,
  conceptName: string,
  isShoe: boolean = false,
): Promise<string> {
  try {
    const imageBuffer = dataUrlToBuffer(dataUrl);
    const metadata = await sharp(imageBuffer).metadata();

    const { width = 0, height = 0, format } = metadata;
    const aspectRatio = width / height;

    console.log(
      `   📐 Image dimensions: ${width}x${height} (aspect ratio: ${aspectRatio.toFixed(2)})`,
    );

    let rotationAngle = 0;

    // For non-shoe items: if image is landscape (width > height), it's likely rotated
    // Apply 90° clockwise rotation to convert landscape to portrait
    if (!isShoe && aspectRatio > 1.0) {
      console.log(
        `   🔄 Landscape orientation detected (${width}x${height}), applying 90° clockwise rotation...`,
      );
      rotationAngle = 90;
    }

    if (rotationAngle !== 0) {
      console.log(`   🔄 Applying ${rotationAngle}° rotation...`);

      const correctedBuffer = await sharp(imageBuffer)
        .rotate(rotationAngle)
        .toBuffer();

      const newMetadata = await sharp(correctedBuffer).metadata();
      const base64Data = correctedBuffer.toString("base64");
      const mimeType = format === "png" ? "image/png" : "image/jpeg";

      console.log(
        `   ✅ Rotation applied: ${width}x${height} → ${newMetadata.width}x${newMetadata.height}`,
      );
      return `data:${mimeType};base64,${base64Data}`;
    }

    // No rotation needed
    console.log(`   ✓ Image orientation correct (${width}x${height})`);
    return dataUrl;
  } catch (error) {
    console.error(`   ⚠️ Could not check/correct rotation:`, error);
    return dataUrl; // Return original on error
  }
}

/**
 * Calculate bounding box area
 */
function calculateBoundingBoxArea(boundingBox: {
  topRow: number;
  leftCol: number;
  bottomRow: number;
  rightCol: number;
}): number {
  const width = boundingBox.rightCol - boundingBox.leftCol;
  const height = boundingBox.bottomRow - boundingBox.topRow;
  return width * height;
}

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes
 * Returns a value between 0 and 1, where:
 * - 0 means no overlap
 * - 1 means perfect overlap
 * - > 0.5 typically indicates the same object
 */
function calculateIoU(
  box1: {
    topRow: number;
    leftCol: number;
    bottomRow: number;
    rightCol: number;
  },
  box2: {
    topRow: number;
    leftCol: number;
    bottomRow: number;
    rightCol: number;
  },
): number {
  // Calculate intersection rectangle
  const intersectionLeft = Math.max(box1.leftCol, box2.leftCol);
  const intersectionTop = Math.max(box1.topRow, box2.topRow);
  const intersectionRight = Math.min(box1.rightCol, box2.rightCol);
  const intersectionBottom = Math.min(box1.bottomRow, box2.bottomRow);

  // Check if there's any intersection
  if (
    intersectionRight < intersectionLeft ||
    intersectionBottom < intersectionTop
  ) {
    return 0; // No overlap
  }

  // Calculate areas
  const intersectionArea =
    (intersectionRight - intersectionLeft) *
    (intersectionBottom - intersectionTop);
  const box1Area = calculateBoundingBoxArea(box1);
  const box2Area = calculateBoundingBoxArea(box2);
  const unionArea = box1Area + box2Area - intersectionArea;

  return intersectionArea / unionArea;
}

/**
 * Variant of filterOverlappingDetections that allows an "outerwear" + "top"
 * pair from the same region to coexist even though their bounding boxes are
 * identical (IoU = 1.0).  All other overlapping pairs are still deduplicated.
 */
function filterOverlappingDetectionsKeepBoth(
  croppedImages: CroppedImage[],
): CroppedImage[] {
  console.log(
    `\n🔍 [EARLY-FILTER] Checking ${croppedImages.length} detections for overlaps (outerwear+top pairs kept)...`,
  );
  console.log(
    `   Detected items: ${croppedImages.map((item) => `${item.conceptName} (${item.confidence.toFixed(2)})`).join(", ")}`,
  );

  const filteredItems: CroppedImage[] = [];
  let duplicatesRemoved = 0;

  for (let i = 0; i < croppedImages.length; i++) {
    const item1 = croppedImages[i];
    let shouldKeepItem1 = true;

    for (let j = 0; j < filteredItems.length; j++) {
      const item2 = filteredItems[j];
      const iou = calculateIoU(item1.boundingBox, item2.boundingBox);

      if (iou > 0.5) {
        // Exception: an outerwear+top pair from the same region should both be kept
        const isOuterwearTopPair =
          (item1.conceptName === "outerwear" && item2.conceptName === "top") ||
          (item1.conceptName === "top" && item2.conceptName === "outerwear");

        if (isOuterwearTopPair) {
          console.log(
            `   ✅ Keeping outerwear+top pair (IoU: ${(iou * 100).toFixed(1)}%): "${item1.conceptName}" + "${item2.conceptName}"`,
          );
          break; // keep item1 as-is
        }

        const area1 = calculateBoundingBoxArea(item1.boundingBox);
        const area2 = calculateBoundingBoxArea(item2.boundingBox);
        const score1 = item1.confidence * 0.6 + area1 * 100 * 0.4;
        const score2 = item2.confidence * 0.6 + area2 * 100 * 0.4;

        if (score1 > score2) {
          console.log(
            `   🔄 Overlap detected (IoU: ${(iou * 100).toFixed(1)}%): Replacing "${item2.conceptName}" with "${item1.conceptName}"`,
          );
          filteredItems.splice(j, 1);
          duplicatesRemoved++;
          break;
        } else {
          console.log(
            `   ⏭️  Overlap detected (IoU: ${(iou * 100).toFixed(1)}%): Skipping "${item1.conceptName}", keeping "${item2.conceptName}"`,
          );
          shouldKeepItem1 = false;
          duplicatesRemoved++;
          break;
        }
      }
    }

    if (shouldKeepItem1) {
      filteredItems.push(item1);
    }
  }

  console.log(
    `✅ [EARLY-FILTER] Filtered to ${filteredItems.length} unique items (removed ${duplicatesRemoved} duplicates)`,
  );
  console.log(
    `   Items to process: ${filteredItems.map((item) => `${item.conceptName} (${(item.confidence * 100).toFixed(1)}%)`).join(", ")}`,
  );

  return filteredItems;
}

/**
 * Filter overlapping detections BEFORE processing
 * This prevents duplicate items (e.g., same shirt detected as "top" and "outerwear")
 * from going through expensive Gemini API calls and background removal
 */
function filterOverlappingDetections(
  croppedImages: CroppedImage[],
): CroppedImage[] {
  console.log(
    `\n🔍 [EARLY-FILTER] Checking ${croppedImages.length} detections for overlaps BEFORE processing...`,
  );
  console.log(
    `   Detected items: ${croppedImages.map((item) => `${item.conceptName} (${item.confidence.toFixed(2)})`).join(", ")}`,
  );

  const filteredItems: CroppedImage[] = [];
  let duplicatesRemoved = 0;

  for (let i = 0; i < croppedImages.length; i++) {
    const item1 = croppedImages[i];
    let shouldKeepItem1 = true;

    for (let j = 0; j < filteredItems.length; j++) {
      const item2 = filteredItems[j];

      // Calculate IoU (Intersection over Union)
      const iou = calculateIoU(item1.boundingBox, item2.boundingBox);

      // If IoU > 0.5, these are likely the same item - keep the better one
      if (iou > 0.5) {
        const area1 = calculateBoundingBoxArea(item1.boundingBox);
        const area2 = calculateBoundingBoxArea(item2.boundingBox);

        // Scoring: confidence (60%) + area (40%)
        const score1 = item1.confidence * 0.6 + area1 * 100 * 0.4;
        const score2 = item2.confidence * 0.6 + area2 * 100 * 0.4;

        if (score1 > score2) {
          // Remove item2, keep item1
          console.log(
            `   🔄 Overlap detected (IoU: ${(iou * 100).toFixed(1)}%): Replacing "${
              item2.conceptName
            }" (conf: ${(item2.confidence * 100).toFixed(1)}%, score: ${score2.toFixed(1)}) with "${
              item1.conceptName
            }" (conf: ${(item1.confidence * 100).toFixed(1)}%, score: ${score1.toFixed(1)})`,
          );
          filteredItems.splice(j, 1);
          duplicatesRemoved++;
          break;
        } else {
          // Keep item2, skip item1
          console.log(
            `   ⏭️  Overlap detected (IoU: ${(iou * 100).toFixed(1)}%): Skipping "${
              item1.conceptName
            }" (conf: ${(item1.confidence * 100).toFixed(1)}%, score: ${score1.toFixed(1)}), keeping "${
              item2.conceptName
            }" (conf: ${(item2.confidence * 100).toFixed(1)}%, score: ${score2.toFixed(1)})`,
          );
          shouldKeepItem1 = false;
          duplicatesRemoved++;
          break;
        }
      }
    }

    if (shouldKeepItem1) {
      filteredItems.push(item1);
    }
  }

  console.log(
    `✅ [EARLY-FILTER] Filtered to ${filteredItems.length} unique items (removed ${duplicatesRemoved} duplicates)`,
  );
  console.log(
    `   Items to process: ${filteredItems.map((item) => `${item.conceptName} (${(item.confidence * 100).toFixed(1)}%)`).join(", ")}`,
  );

  return filteredItems;
}

/**
 * Process a single cropped clothing item using direct buffer
 */
async function processSingleClothingItemDirect(
  croppedImage: CroppedImage,
  userId: string,
  originalFileName: string,
): Promise<IsolatedClothingItem> {
  try {
    console.log(
      `🔄 Processing ${croppedImage.conceptName} (region ${croppedImage.regionId})...`,
    );

    // Check if it's a shoe item
    const isShoe =
      croppedImage.conceptName.toLowerCase().includes("shoe") ||
      croppedImage.conceptName.toLowerCase().includes("sneaker") ||
      croppedImage.conceptName.toLowerCase().includes("boot") ||
      croppedImage.conceptName.toLowerCase().includes("sandal") ||
      croppedImage.conceptName.toLowerCase().includes("heel") ||
      croppedImage.conceptName.toLowerCase().includes("footwear");

    if (isShoe) {
      console.log(`👟 Detected shoe item - will generate a complete pair`);
    }

    // Always download from URL (no buffers in memory)
    console.log(
      `Downloading cropped image from GCS for ${croppedImage.conceptName}...`,
    );
    const croppedImageBuffer = await downloadImageFromUrl(
      croppedImage.croppedImageUrl,
    );

    // Generate isolated clothing using Gemini
    const { isolatedImage, description } = await generateIsolatedClothing(
      croppedImageBuffer,
      croppedImage.conceptName,
    );

    // Check and correct rotation if needed
    console.log(`🔍 Checking orientation for ${croppedImage.conceptName}...`);
    const rotationCorrectedImage = await correctImageRotation(
      isolatedImage,
      croppedImage.conceptName,
      isShoe,
    );

    // Apply background removal to the Gemini-generated image
    console.log(
      `🎨 Applying background removal to isolated ${croppedImage.conceptName}...`,
    );
    let finalIsolatedImage = rotationCorrectedImage;

    try {
      const bgRemovedBase64 = await removeBackgroundFromBase64(
        rotationCorrectedImage,
        {
          background: "transparent",
        },
      );

      finalIsolatedImage = bgRemovedBase64;
      console.log(
        `✅ Background removed for isolated ${croppedImage.conceptName}`,
      );
    } catch (bgError: any) {
      console.error(
        `⚠️ Background removal failed for isolated ${croppedImage.conceptName}, using original:`,
        bgError.message,
      );
    }

    // Standardize to category-specific canvas (crop tight + pad + resize)
    console.log(
      `📐 Standardizing canvas size for ${croppedImage.conceptName}...`,
    );
    let isolatedImageBuffer = dataUrlToBuffer(finalIsolatedImage);
    try {
      isolatedImageBuffer = await standardizeClothingImage(
        isolatedImageBuffer,
        croppedImage.conceptName,
      );
    } catch (standardizeError: any) {
      console.error(
        `⚠️ Standardization failed for ${croppedImage.conceptName}, using unstandardized image:`,
        standardizeError.message,
      );
    }

    // Create filename for isolated image
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const isolatedFileName = `isolated_${croppedImage.conceptName}_${
      croppedImage.regionId
    }_${timestamp}_${originalFileName.split(".")[0]}.png`;

    // Upload to GCS under user's Apparels/Processed folder
    const uploadResult = await gcsService.uploadFile(
      isolatedImageBuffer,
      isolatedFileName,
      userId,
      "AddOutfit/Processed",
      "image/png",
    );

    console.log(
      `✅ Successfully isolated and uploaded: ${croppedImage.conceptName}`,
    );
    console.log(`   GS URI: ${uploadResult.gsUri}`);

    return {
      regionId: croppedImage.regionId,
      conceptName: croppedImage.conceptName,
      originalConfidence: croppedImage.confidence,
      description,
      isolatedImageUrl: uploadResult.httpUrl,
      isolatedFileName,
      originalCroppedUrl: croppedImage.croppedImageUrl,
      success: true,
    };
  } catch (error) {
    console.error(`❌ Error processing ${croppedImage.conceptName}:`, error);

    return {
      regionId: croppedImage.regionId,
      conceptName: croppedImage.conceptName,
      originalConfidence: croppedImage.confidence,
      description: "",
      isolatedImageUrl: "",
      isolatedFileName: "",
      originalCroppedUrl: croppedImage.croppedImageUrl,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Process all cropped clothing images and generate isolated versions
 */
export async function isolateClothingItems(
  croppedImages: CroppedImage[],
  userId: string,
  originalFileName: string,
): Promise<ClothingIsolationResult> {
  try {
    console.log(
      `🎨 [ISOLATION] Starting clothing isolation for ${croppedImages.length} items...`,
    );
    console.log(
      `   Items to isolate: ${croppedImages.map((item) => `${item.conceptName} (region ${item.regionId})`).join(", ")}`,
    );

    // ===== CRITICAL: Filter overlapping detections BEFORE expensive processing =====
    // filterOverlappingDetectionsKeepBoth preserves intentional outerwear+top pairs
    // while still deduplicating all other accidental overlaps.
    const filteredImages = filterOverlappingDetectionsKeepBoth(croppedImages);

    if (filteredImages.length === 0) {
      console.log(`⚠️ [ISOLATION] All items were filtered out as duplicates`);
      return {
        success: false,
        message: "All detected items were duplicates",
        totalProcessed: 0,
        isolatedItems: [],
        originalFileName,
      };
    }

    // Ensure user folder exists in GCS
    await gcsService.ensureUserFolderExists(userId);

    const isolatedItems: IsolatedClothingItem[] = [];
    const BATCH_SIZE = 3; // Process 3 items at a time

    // Process images in parallel batches for better performance
    for (let i = 0; i < filteredImages.length; i += BATCH_SIZE) {
      const batch = filteredImages.slice(i, i + BATCH_SIZE);

      console.log(
        `🔄 [ISOLATION] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(filteredImages.length / BATCH_SIZE)} (${batch.length} items)`,
      );

      const batchResults = await Promise.all(
        batch.map((croppedImage) =>
          processSingleClothingItemDirect(
            croppedImage,
            userId,
            originalFileName,
          ),
        ),
      );

      isolatedItems.push(...batchResults);

      // Log results for this batch
      batchResults.forEach((item) => {
        console.log(
          `   Result: ${item.success ? "✅ SUCCESS" : "❌ FAILED"} - ${item.conceptName}`,
        );
      });

      // Small delay between batches to avoid overwhelming APIs
      if (i + BATCH_SIZE < filteredImages.length) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    const successfulItems = isolatedItems.filter((item) => item.success);
    const failedItems = isolatedItems.filter((item) => !item.success);

    console.log(
      `🎯 [ISOLATION] Clothing isolation completed: ${successfulItems.length} successful, ${failedItems.length} failed`,
    );
    console.log(
      `   Successful items: ${successfulItems.map((item) => item.conceptName).join(", ") || "none"}`,
    );
    console.log(
      `   Failed items: ${failedItems.map((item) => item.conceptName).join(", ") || "none"}`,
    );

    return {
      success: true,
      message: `Clothing isolation completed. ${successfulItems.length} items successfully isolated (${failedItems.length} failed).`,
      totalProcessed: isolatedItems.length,
      isolatedItems,
      originalFileName,
    };
  } catch (error) {
    console.error("Error in isolateClothingItems:", error);

    return {
      success: false,
      message: `Error during clothing isolation: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      totalProcessed: 0,
      isolatedItems: [],
      originalFileName,
    };
  }
}
