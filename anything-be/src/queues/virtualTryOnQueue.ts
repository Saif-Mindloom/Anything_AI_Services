import { Job, Queue, Worker } from "bullmq";
import { redisConnection } from "./redis";
import { Outfit } from "../models/outfit.model";
import { User } from "../models/user.model";
import { Apparel } from "../models/apparel.model";
import { gcsService } from "../services/gcsService";
import { removeBackgroundFromBase64 } from "../services/backgroundRemovalService";
import { GoogleGenAI, Modality } from "@google/genai";
import sharp from "sharp";
import { Op } from "sequelize";
import { generateOutfitSummary } from "../services/accessoryGenerationService";
import { centerAndStandardizeImage } from "../helpers/imageUtils";

// Initialize Google Gen AI SDK with API key (not Vertex AI)
const ai = new GoogleGenAI({
  apiKey:
    process.env.GEMINI_API_KEY || "AIzaSyB_m0qCgrF1GGFXnY7DmOEXHwDtnBVEhlY",
});

// ============================================
// Queue Definition
// ============================================
export const virtualTryOnQueue = new Queue("virtualTryOn", {
  connection: redisConnection,
});

// ============================================
// Helper: Download and convert image to base64
// ============================================
async function downloadAndConvertToBase64(httpUrl: string): Promise<string> {
  const response = await fetch(httpUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download image from ${httpUrl}: ${response.statusText}`,
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

function buildAccessoryEditPrompt(
  accessoryType: string,
  description: string,
): string {
  const type = accessoryType.toLowerCase();

  const basePrompt = `You are an expert virtual try-on editor. Add the ${accessoryType.toLowerCase()} from the reference image to the person in the main image.

PRIMARY GOAL:
- The person must be wearing the ${accessoryType.toLowerCase()} naturally.
- Preserve identity, face, hair, skin tone, body shape, clothing, pose, and background exactly.
- Only add the accessory; do not alter any other part of the image.
- Match the accessory style from the reference image${description ? `: ${description}` : ""}.

SPATIAL CONSTRAINTS & COMPOSITION (CRITICAL):
1. Percentage-based margins must stay the same as the input image:
  - Keep the same top headroom, side spacing, and bottom spacing.
  - Do not change subject scale or camera distance.
2. Vertical anchor points must stay unchanged:
  - Head near original top position.
  - Shoulders, waist, knees, and feet remain at same relative heights.
  - Feet must remain fully visible near the bottom area (no truncation).
3. Horizontal centering must stay unchanged:
  - Body centerline remains aligned with frame center as in input.
  - No left/right shift.
4. Framing consistency:
  - Keep exact same framing, perspective, and aspect ratio.
  - Keep exact same canvas dimensions.

MANDATORY RULES (MUST FOLLOW EXACTLY):
- Do NOT zoom in or zoom out.
- Do NOT crop, reframe, pan, tilt, rotate, or reposition the person.
- Do NOT remove or hide legs, ankles, feet, shoes, hands, or head.
- Do NOT change body proportions, silhouette, or pose.
- Do NOT replace background or alter lighting setup.
- Edit only the minimum local region needed to add the accessory.

FORBIDDEN OUTPUTS:
- Any image where feet are cut off, partially missing, or outside frame.
- Any full-body-to-mid-body reframing.
- Any change in subject size relative to frame.
- Any composition shift compared to input.

FINAL VERIFICATION BEFORE OUTPUT:
□ Full body visible from head to toe? (MUST be YES)
□ Feet and shoes fully visible and uncropped? (MUST be YES)
□ Same framing and canvas size as input? (MUST be YES)
□ Only accessory changed, all else preserved? (MUST be YES)`;

  if (type === "headwear") {
    return `${basePrompt} Place the headwear on top of the person's head, conforming to the head shape naturally.`;
  } else if (type === "eyewear") {
    return `${basePrompt} Place the eyewear on the person's face, resting on the nose bridge and extending to the ears.`;
  } else if (type === "necklace" || type === "chain") {
    return `${basePrompt} Place the necklace around the person's neck, hanging naturally on the chest over the existing clothing.`;
  } else if (type === "earing" || type === "earring") {
    return `${basePrompt} Place earrings on both ears, hanging naturally from the earlobes.`;
  } else if (type === "watch") {
    return `${basePrompt} Place the watch around one wrist (typically left), with the watch face visible on top of the wrist.`;
  } else if (type === "bracelet") {
    return `${basePrompt} Place the bracelet around the wrist or forearm, wrapping naturally.`;
  } else if (type === "ring") {
    return `${basePrompt} Place the ring on one or more fingers, fitted naturally to the finger.`;
  } else if (type === "belt") {
    return `${basePrompt} Place the belt around the waist over the existing clothing, with the buckle centered at the front.`;
  } else if (type === "scarf") {
    return `${basePrompt} Place the scarf around the neck or draped over shoulders, hanging naturally with realistic fabric flow over the existing clothing.`;
  }

  return basePrompt;
}

async function resolveAccessoryApparelIdsByUrls(
  userId: number,
  accessoryUrls: string[],
): Promise<number[]> {
  if (!accessoryUrls.length) {
    return [];
  }

  const uniqueUrls = Array.from(new Set(accessoryUrls.filter(Boolean)));

  const matchedAccessories = await Apparel.findAll({
    where: {
      userId,
      category: "accessory",
      [Op.or]: [
        { urlProcessed: { [Op.in]: uniqueUrls } },
        { urlRaw: { [Op.in]: uniqueUrls } },
        { originalUploadedImageUrl: { [Op.in]: uniqueUrls } },
      ],
    },
    attributes: ["id"],
  });

  return Array.from(new Set(matchedAccessories.map((item) => item.id)));
}

// ============================================
// Helper: Extract multiple disconnected objects from an image
// ============================================
export async function extractMultipleObjects(
  imageBuffer: Buffer,
  minObjectSize: number = 100, // Minimum pixels for an object to be considered valid
  saveDebugImages: boolean = true,
  debugPrefix: string = "extracted",
): Promise<Buffer[]> {
  try {
    console.log(
      `🔍 Starting multi-object extraction (minSize: ${minObjectSize}px)...`,
    );

    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      console.warn("Unable to determine image dimensions");
      return [];
    }

    console.log(`📐 Image dimensions: ${metadata.width}x${metadata.height}`);

    // Convert to raw pixel data with alpha channel
    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const width = info.width;
    const height = info.height;
    const channels = info.channels;

    // Create a visited array to track which pixels we've processed
    const visited = new Array(width * height).fill(false);

    // Function to perform flood fill and find connected component
    function floodFill(
      startX: number,
      startY: number,
    ): Array<[number, number]> {
      const stack: Array<[number, number]> = [[startX, startY]];
      const component: Array<[number, number]> = [];

      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        const idx = y * width + x;

        if (x < 0 || x >= width || y < 0 || y >= height || visited[idx]) {
          continue;
        }

        const pixelIdx = idx * channels;
        const alpha = data[pixelIdx + 3];

        // If pixel is transparent, skip it
        if (alpha <= 25) {
          visited[idx] = true;
          continue;
        }

        // Mark as visited and add to component
        visited[idx] = true;
        component.push([x, y]);

        // Add neighbors to stack (4-connectivity)
        stack.push([x + 1, y]);
        stack.push([x - 1, y]);
        stack.push([x, y + 1]);
        stack.push([x, y - 1]);
      }

      return component;
    }

    // Find all connected components (separate objects)
    const components: Array<Array<[number, number]>> = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (visited[idx]) continue;

        const pixelIdx = idx * channels;
        const alpha = data[pixelIdx + 3];

        // Start flood fill from non-transparent, unvisited pixel
        if (alpha > 25) {
          const component = floodFill(x, y);
          if (component.length >= minObjectSize) {
            components.push(component);
          }
        }
      }
    }

    console.log(`🔍 Found ${components.length} separate objects in image`);

    // Sort components by horizontal position (LEFT to RIGHT) to match prompt order
    // This prevents label mismatches - leftmost object = first description, etc.
    components.sort((a, b) => {
      // Calculate center X position for each component
      let centerXA = 0,
        centerXB = 0;
      for (const [x] of a) centerXA += x;
      for (const [x] of b) centerXB += x;
      centerXA /= a.length;
      centerXB /= b.length;
      return centerXA - centerXB; // Sort left to right
    });

    console.log(
      `📐 Sorted objects by position (left to right) to match prompt order`,
    );

    // Save debug image showing all detected objects with bounding boxes
    if (saveDebugImages && components.length > 0) {
      try {
        const fs = await import("fs/promises");
        const path = await import("path");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

        // Create SVG overlay showing all bounding boxes
        let svgRects = "";
        const colors = ["red", "lime", "yellow", "cyan", "magenta", "orange"];

        for (let i = 0; i < components.length; i++) {
          const component = components[i];
          let minX = width,
            minY = height,
            maxX = 0,
            maxY = 0;

          for (const [x, y] of component) {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }

          const objWidth = maxX - minX + 1;
          const objHeight = maxY - minY + 1;
          const color = colors[i % colors.length];

          svgRects += `
            <rect x="${minX}" y="${minY}" width="${objWidth}" height="${objHeight}" 
                  fill="none" stroke="${color}" stroke-width="3" />
            <text x="${minX + 10}" y="${minY + 25}" 
                  font-family="Arial" font-size="20" fill="${color}" font-weight="bold">
              Object ${i + 1}: ${objWidth}×${objHeight}px
            </text>
          `;
        }

        const svg = `
          <svg width="${width}" height="${height}">
            ${svgRects}
            <rect x="10" y="10" width="350" height="60" fill="black" fill-opacity="0.7" />
            <text x="20" y="35" font-family="Arial" font-size="18" fill="white" font-weight="bold">
              🔍 Detected ${components.length} objects
            </text>
            <text x="20" y="55" font-family="Arial" font-size="14" fill="white">
              Min size threshold: ${minObjectSize}px
            </text>
          </svg>
        `;

        const debugImage = await sharp(imageBuffer)
          .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
          .png()
          .toBuffer();

        const debugPath = path.join(
          process.cwd(),
          "generated-images",
          "debug-accessories",
          `${debugPrefix}-detection-${timestamp}.png`,
        );

        await fs.mkdir(path.dirname(debugPath), { recursive: true });
        await fs.writeFile(debugPath, debugImage);
        console.log(`🐛 Debug detection image saved: ${debugPath}`);
      } catch (debugError) {
        console.warn(`Could not save debug detection image:`, debugError);
      }
    }

    // Extract each component as a separate image
    const extractedObjects: Buffer[] = [];

    for (let i = 0; i < components.length; i++) {
      const component = components[i];

      // Find bounding box for this component
      let minX = width;
      let minY = height;
      let maxX = 0;
      let maxY = 0;

      for (const [x, y] of component) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }

      const objWidth = maxX - minX + 1;
      const objHeight = maxY - minY + 1;

      console.log(
        `📦 Object ${i + 1}: ${objWidth}x${objHeight} at (${minX}, ${minY})`,
      );

      // Add padding around object
      const padding = Math.max(objWidth, objHeight) * 0.1;
      const cropLeft = Math.max(0, Math.floor(minX - padding));
      const cropTop = Math.max(0, Math.floor(minY - padding));
      const cropWidth = Math.min(
        Math.ceil(objWidth + padding * 2),
        width - cropLeft,
      );
      const cropHeight = Math.min(
        Math.ceil(objHeight + padding * 2),
        height - cropTop,
      );

      // Extract this object
      const extractedObject = await sharp(imageBuffer)
        .extract({
          left: cropLeft,
          top: cropTop,
          width: cropWidth,
          height: cropHeight,
        })
        .toBuffer();

      // Save debug image of extracted object
      if (saveDebugImages) {
        try {
          const fs = await import("fs/promises");
          const path = await import("path");
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const debugPath = path.join(
            process.cwd(),
            "generated-images",
            "debug-accessories",
            `EXTRACTED-object-${i + 1}-${debugPrefix}-${timestamp}.png`,
          );

          await fs.mkdir(path.dirname(debugPath), { recursive: true });
          await fs.writeFile(debugPath, extractedObject);
          console.log(
            `\n🐛 ==================== DEBUG SAVE ====================`,
          );
          console.log(`🐛 EXTRACTED OBJECT #${i + 1} (individual accessory)`);
          console.log(`🐛 Saved to: ${debugPath}`);
          console.log(
            `🐛 ====================================================\n`,
          );
        } catch (debugError) {
          console.warn(`Could not save extracted object ${i + 1}:`, debugError);
        }
      }

      extractedObjects.push(extractedObject);
    }

    return extractedObjects;
  } catch (error) {
    console.error("Error in extractMultipleObjects:", error);
    return [];
  }
}

// ============================================
// Worker Definition
// ============================================
const virtualTryOnWorker = new Worker(
  "virtualTryOn",
  async (job: Job) => {
    const {
      userId,
      topId,
      bottomId,
      shoesId,
      dressId,
      outerwearId,
      apparelGSURL,
      topGSURL,
      bottomGSURL,
      shoesGSURL,
      dressGSURL,
      outerwearGSURL,
      accessory1Url,
      accessory1Category,
      accessory1Description,
      accessory2Url,
      accessory2Category,
      accessory2Description,
      accessory3Url,
      accessory3Category,
      accessory3Description,
      baseModel,
      newModelGsUrl,
    } = job.data;

    try {
      await job.updateProgress(5);
      await job.log(`Starting virtual try-on for user: ${userId}`);

      // Get apparel IDs
      const receivedTopId = topId ?? 0;
      const receivedBottomId = bottomId ?? 0;
      const receivedShoesId = shoesId ?? 0;
      const receivedDressId = dressId ?? 0;
      const receivedOuterwearId = outerwearId ?? 0;

      await job.log(
        `Checking for existing outfit (Top:${receivedTopId} Bottom:${receivedBottomId} Shoes:${receivedShoesId} Dress:${receivedDressId} Outerwear:${receivedOuterwearId})`,
      );

      const accessoryItems = [
        {
          url: accessory1Url,
          category: accessory1Category,
          description: accessory1Description,
        },
        {
          url: accessory2Url,
          category: accessory2Category,
          description: accessory2Description,
        },
        {
          url: accessory3Url,
          category: accessory3Category,
          description: accessory3Description,
        },
      ].filter((item) => !!item.url && !!item.category);

      const hasAccessoryInputs = accessoryItems.length > 0;

      // Check cache only for non-accessory requests.
      // Accessory combinations are not currently part of outfit cache key.
      if (!hasAccessoryInputs) {
        const existingOutfit = await Outfit.findOne({
          where: {
            userId: userId,
            topId: receivedTopId,
            bottomId: receivedBottomId,
            shoeId: receivedShoesId,
            dressId: receivedDressId,
            outerwearId: receivedOuterwearId,
          },
        });

        if (existingOutfit) {
          await job.log("Outfit found in cache, returning cached result");
          return {
            success: true,
            message: "Outfit already exists in cache",
            imageBase64: null,
            savedFileName: `${existingOutfit.id}.png`,
            downloadUrl: existingOutfit.primaryImageUrl || undefined,
          };
        }
      } else {
        await job.log(
          `Accessory mode enabled (${accessoryItems.length} items) - skipping outfit cache lookup`,
        );
      }

      await job.updateProgress(10);
      await job.log("Determining model image URL...");

      // Determine the model image URL
      let modelImageUrl: string;
      if (baseModel) {
        const user = await User.findByPk(userId);
        if (!user || !user.baseModelUrl) {
          throw new Error("User does not have a base model URL");
        }
        modelImageUrl = user.baseModelUrl;
      } else {
        if (!newModelGsUrl) {
          throw new Error("newModelGsUrl is required when baseModel is false");
        }
        modelImageUrl = newModelGsUrl;
      }

      // Detect which mode we're in
      const hasSpecificURLs = !!(
        topGSURL ||
        bottomGSURL ||
        shoesGSURL ||
        dressGSURL ||
        outerwearGSURL
      );
      const hasGenericURL = !!apparelGSURL;
      const hasGarmentInputs = hasSpecificURLs || hasGenericURL;
      // Outerwear-only gets a dedicated sequential path — not a composite batch
      const isOuterwearOnly = !!(
        outerwearGSURL &&
        !topGSURL &&
        !bottomGSURL &&
        !shoesGSURL &&
        !dressGSURL
      );
      const isBatchMode = hasSpecificURLs && !isOuterwearOnly;

      await job.log(
        `🎯 Mode: ${!hasGarmentInputs ? "ACCESSORY-ONLY" : isOuterwearOnly ? "OUTERWEAR-SEQUENTIAL" : isBatchMode ? "BATCH" : "SEQUENTIAL"}`,
      );

      let garmentImageUrl: string;
      let garmentImageBase64: string;

      if (isBatchMode) {
        // BATCH MODE: Composite multiple garments into one image
        await job.log("📦 Batch mode: Creating composite garment image...");

        const garmentItems: Array<{ url: string; type: string }> = [];
        if (outerwearGSURL)
          garmentItems.push({ url: outerwearGSURL, type: "outerwear" });
        if (topGSURL) garmentItems.push({ url: topGSURL, type: "top" });
        if (bottomGSURL)
          garmentItems.push({ url: bottomGSURL, type: "bottom" });
        if (shoesGSURL) garmentItems.push({ url: shoesGSURL, type: "shoes" });
        if (dressGSURL) garmentItems.push({ url: dressGSURL, type: "dress" });

        await job.log(
          `   Items to composite: ${garmentItems.map((g) => g.type).join(", ")}`,
        );

        // Download all garment images
        const garmentBuffers: Array<{ buffer: Buffer; type: string }> = [];
        for (const item of garmentItems) {
          try {
            const base64 = await downloadAndConvertToBase64(item.url);
            const buffer = Buffer.from(base64, "base64");
            garmentBuffers.push({ buffer, type: item.type });
            await job.log(`   ✓ Downloaded ${item.type}`);
          } catch (error: any) {
            await job.log(
              `   ✗ Failed to download ${item.type}: ${error.message}`,
            );
            throw new Error(
              `Failed to download ${item.type} from ${item.url}: ${error.message}`,
            );
          }
        }

        // Create composite image: arrange garments in a 2x2 GRID layout
        // This makes it clearly a "product showcase" that looks nothing like the desired output
        const sortedBuffers = garmentBuffers.sort((a, b) => {
          const order = { dress: 0, outerwear: 1, top: 2, bottom: 3, shoes: 4 };
          return (
            order[a.type as keyof typeof order] -
            order[b.type as keyof typeof order]
          );
        });

        // Get dimensions of all images and resize to uniform size for grid
        const uniformSize = 400; // All items will be 400x400
        const resizedBuffers = await Promise.all(
          sortedBuffers.map(async ({ buffer, type }) => {
            const resized = await sharp(buffer)
              .resize(uniformSize, uniformSize, {
                fit: "contain",
                background: { r: 255, g: 255, b: 255, alpha: 0 },
              })
              .toBuffer();
            return { buffer: resized, type };
          }),
        );

        // Calculate grid dimensions (2 columns)
        const itemsPerRow = 2;
        const rows = Math.ceil(resizedBuffers.length / itemsPerRow);
        const padding = 40;
        const gridWidth =
          uniformSize * itemsPerRow + padding * (itemsPerRow + 1);
        const gridHeight = uniformSize * rows + padding * (rows + 1);

        await job.log(
          `   Composite dimensions: ${gridWidth}x${gridHeight} (${itemsPerRow}x${rows} grid layout)`,
        );

        // Create composite image in GRID layout
        const compositeOperations = [];

        for (let i = 0; i < resizedBuffers.length; i++) {
          const { buffer, type } = resizedBuffers[i];
          const row = Math.floor(i / itemsPerRow);
          const col = i % itemsPerRow;

          const xPos = padding + col * (uniformSize + padding);
          const yPos = padding + row * (uniformSize + padding);

          await job.log(`   Placing ${type} in grid at (${xPos}, ${yPos})`);

          compositeOperations.push({
            input: buffer,
            left: xPos,
            top: yPos,
          });
        }

        const compositeBuffer = await sharp({
          create: {
            width: gridWidth,
            height: gridHeight,
            channels: 4,
            background: { r: 245, g: 245, b: 245, alpha: 1 },
          },
        })
          .composite(compositeOperations)
          .png()
          .toBuffer();

        garmentImageBase64 = compositeBuffer.toString("base64");
        await job.log("   ✓ Composite image created successfully");
      } else if (hasGarmentInputs) {
        // SEQUENTIAL / OUTERWEAR-ONLY MODE: Use single garment URL
        await job.log("📦 Sequential mode: Using single garment image");
        garmentImageUrl = isOuterwearOnly ? outerwearGSURL! : apparelGSURL!;
      }

      await job.updateProgress(20);
      await job.log("Downloading images...");
      await job.log(`Model image URL: ${modelImageUrl}`);
      if (!isBatchMode && hasGarmentInputs) {
        await job.log(`Garment image URL: ${garmentImageUrl}`);
      }
      await job.log(
        `Outfit composition (Top:${receivedTopId} Bottom:${receivedBottomId} Shoes:${receivedShoesId} Dress:${receivedDressId})`,
      );

      // Download model image
      let modelImageBase64: string;

      try {
        modelImageBase64 = await downloadAndConvertToBase64(modelImageUrl);
        await job.log("Model image downloaded successfully");
      } catch (downloadError: any) {
        await job.log(`Model image download failed: ${downloadError.message}`);
        throw new Error(
          `Failed to download model image from ${modelImageUrl}: ${downloadError.message}`,
        );
      }

      // Download garment image (only if sequential garment mode - batch mode already downloaded)
      if (!isBatchMode && hasGarmentInputs) {
        try {
          garmentImageBase64 =
            await downloadAndConvertToBase64(garmentImageUrl);
          await job.log("Garment image downloaded successfully");
        } catch (downloadError: any) {
          await job.log(
            `Garment image download failed: ${downloadError.message}`,
          );
          throw new Error(
            `Failed to download garment image from ${garmentImageUrl}: ${downloadError.message}`,
          );
        }
      }

      if (!hasGarmentInputs) {
        await job.log(
          "No garment input provided. Starting from model image and applying accessories only.",
        );
      }

      await job.updateProgress(30);
      await job.log("Calling Gemini API for virtual try-on...");

      let imageBuffer: Buffer | null = null;
      let imageMimeType = "image/png";

      if (!hasGarmentInputs) {
        imageBuffer = Buffer.from(modelImageBase64, "base64");
        imageMimeType = "image/jpeg";
        await job.log("Skipped garment generation step (accessory-only mode).");
      }

      // Determine which garment category is being applied
      let garmentCategory = "";
      let garmentCategoryName = "";

      if (isOuterwearOnly) {
        garmentCategory = "OUTERWEAR";
        garmentCategoryName = "JACKET/COAT/BLAZER";
      } else if (isBatchMode) {
        // Batch mode: Multiple items
        garmentCategory = "BATCH";
        const items = [];
        if (outerwearGSURL) items.push("OUTERWEAR");
        if (topGSURL) items.push("TOP");
        if (bottomGSURL) items.push("BOTTOM");
        if (shoesGSURL) items.push("SHOES");
        if (dressGSURL) items.push("DRESS");
        garmentCategoryName = items.join(" + ");
      } else if (
        receivedTopId > 0 &&
        receivedBottomId === 0 &&
        receivedDressId === 0
      ) {
        garmentCategory = "TOP";
        garmentCategoryName = "TOP/SHIRT/JACKET";
      } else if (
        receivedBottomId > 0 &&
        receivedTopId === 0 &&
        receivedDressId === 0
      ) {
        garmentCategory = "BOTTOM";
        garmentCategoryName = "PANTS/BOTTOMS/TROUSERS";
      } else if (receivedDressId > 0) {
        garmentCategory = "DRESS";
        garmentCategoryName = "DRESS/FULL OUTFIT";
      } else if (
        receivedShoesId > 0 &&
        receivedTopId === 0 &&
        receivedBottomId === 0 &&
        receivedDressId === 0
      ) {
        garmentCategory = "SHOES";
        garmentCategoryName = "SHOES/FOOTWEAR";
      } else {
        // Multiple items being applied at once (sequential mode edge case)
        garmentCategory = "MULTIPLE";
        garmentCategoryName = "MULTIPLE ITEMS";
      }

      await job.log(
        `Applying garment category: ${garmentCategory} (${garmentCategoryName})`,
      );

      // Generate category-specific prompt
      const baseInstructions = `You are an expert virtual try-on AI specialized in creating realistic fashion photographs. Your task is to create a photorealistic image where the person from the FIRST image is FULLY DRESSED and WEARING the clothing item(s) from the SECOND image as a complete outfit.

**FUNDAMENTAL PRINCIPLE:**
The person must be WEARING the clothes ON their body - fitted, natural, and realistic. The clothes are NOT separate objects floating around or displayed next to the person. Think of this as a fashion catalog photo where the model is professionally dressed.

**CRITICAL - MUST MAINTAIN EXACTLY:**
1. **Person's Identity:** Face, hair, skin tone, body shape, and all physical features MUST remain IDENTICAL.
2. **Person's Pose:** Body pose, stance, hand position, leg position MUST be EXACTLY the same.
3. **Background:** MUST remain completely unchanged - same neutral studio backdrop (light gray #f0f0f0).
4. **Lighting:** Professional studio lighting, shadows, and highlights MUST match the original.

**SPATIAL CONSTRAINTS & COMPOSITION (CRITICAL):**
1. **Percentage-Based Margins:**
   - Leave 12-15% empty space at the TOP of the image (above the person's head)
   - Leave 5-8% empty space at the BOTTOM of the image (below the person's feet)
   - Leave 12-15% empty space on the LEFT side of the image
   - Leave 12-15% empty space on the RIGHT side of the image
   - Person should occupy the central 70-76% width and 77-83% height of the frame

2. **Vertical Positioning (Anchor Points):**
   - Person's head (top of hair) should be positioned at 12-15% from the top edge
   - Person's shoulders should be at approximately 20-25% from the top edge
   - Person's waist should be at approximately 45-50% from the top edge
   - Person's feet should end at 92-95% from the top edge
   - Full body MUST be visible from head to toe - NO CROPPING

3. **Horizontal Positioning (Centering):**
   - Person's body centerline MUST align perfectly with the image's vertical center (50% mark)
   - Person's shoulders must be equidistant from left and right edges
   - Equal negative space on both left and right sides
   - Person should be perfectly centered - not shifted left or right

4. **Framing Consistency:**
   - Maintain the EXACT same camera distance and perspective as the FIRST image
   - Same head-to-feet framing ratio
   - Person should appear at the same scale relative to the frame
   - No zoom in or zoom out from the original framing`;

      let categorySpecificInstructions = "";

      if (garmentCategory === "OUTERWEAR") {
        categorySpecificInstructions = `
**GARMENT TYPE: OUTERWEAR (JACKET/COAT/BLAZER)**

**YOUR TASK:**
The SECOND image shows an OUTERWEAR item (jacket/coat/blazer). You must add it as an outer layer on the person.

**🚨 THIS IS AN OUTER LAYER CHANGE ONLY — READ CAREFULLY:**
1. Look at the person in the FIRST image. Note the exact color, pattern, and style of their inner shirt/top.
2. ONLY remove the existing outer jacket/coat if they are wearing one — remove NOTHING else.
3. ADD the new outerwear from the SECOND image on top of the person's existing inner shirt.
4. The inner shirt/top must appear IDENTICAL in the output — same exact color, same neckline, same style.

**INNER TOP PRESERVATION — ABSOLUTE RULE:**
- If the person wears a WHITE shirt → the output MUST show that same WHITE shirt under the jacket
- If the person wears a BLUE shirt → the output MUST show that same BLUE shirt under the jacket
- If the person wears a STRIPED shirt → the output MUST show that same STRIPED shirt under the jacket
- The inner shirt is a LOCKED element — it does not change under any circumstances

**CRITICAL:**
- DO NOT change, replace, or alter the inner shirt/top in ANY way
- DO NOT default to a black, white, or any other generic shirt underneath
- ONLY the outer layer (jacket/coat) is new — everything else stays the same
- The final image should show: EXISTING INNER SHIRT (unchanged) + NEW OUTERWEAR on top + existing bottom/shoes (unchanged)

**FORBIDDEN:**
✗ Changing the inner shirt to black or any other color
✗ Replacing the original inner shirt with a generic or default shirt
✗ Inventing a new inner garment that wasn't in the FIRST image`;
      } else if (garmentCategory === "BATCH") {
        // BATCH MODE: Multiple garments arranged vertically in one image
        const itemsList = [];
        if (outerwearGSURL) itemsList.push("OUTERWEAR (jacket/coat/blazer)");
        if (topGSURL) itemsList.push("TOP (shirt/blouse/t-shirt)");
        if (bottomGSURL) itemsList.push("BOTTOM (pants/trousers/jeans)");
        if (shoesGSURL) itemsList.push("SHOES (footwear)");
        if (dressGSURL) itemsList.push("DRESS (full outfit)");

        categorySpecificInstructions = `
**GARMENT TYPE: COMPLETE OUTFIT (MULTIPLE ITEMS)**

**🚨 CRITICAL UNDERSTANDING - THE REFERENCE VS OUTPUT DISTINCTION:**

The SECOND image you receive is a PRODUCT CATALOG PAGE showing ${itemsList.join(", ")} arranged in a GRID LAYOUT (like a product display board). This is ONLY a reference guide. Your output must be COMPLETELY DIFFERENT.

**REFERENCE IMAGE (what you see):** Product catalog grid showing items in separate boxes
**YOUR OUTPUT (what you create):** Fashion photograph of ONE person wearing all items

These are TWO FUNDAMENTALLY DIFFERENT TYPES OF IMAGES. Do NOT replicate the catalog layout.

---

**YOUR TASK:**
Create a single fashion photograph showing the person from the FIRST image now wearing ALL the garments from the reference catalog as a complete, coordinated outfit.

---

**STEP-BY-STEP EXECUTION:**

1. **Extract garment details from the reference catalog:**
   ${outerwearGSURL ? "   ✓ Note the OUTERWEAR (jacket/coat) design, color, style\n" : ""}${topGSURL ? "   ✓ Note the TOP design, color, style\n" : ""}${bottomGSURL ? "   ✓ Note the BOTTOM design, color, style\n" : ""}${shoesGSURL ? "   ✓ Note the SHOES design, color, style\n" : ""}${dressGSURL ? "   ✓ Note the DRESS design, color, style\n" : ""}
2. **Strip the person from the FIRST image:**
   ${outerwearGSURL && !topGSURL ? "   ✓ Remove the existing outer layer/jacket ONLY\n   🚨 DO NOT remove, alter, or replace the inner shirt/top — it must remain exactly as it appears in the FIRST image\n" : ""}${outerwearGSURL && topGSURL ? "   ✓ Remove existing outer layer/jacket\n" : ""}${topGSURL ? "   ✓ Remove existing upper body clothing (shirt/top)\n" : ""}${bottomGSURL ? "   ✓ Remove existing lower body clothing\n" : ""}${shoesGSURL ? "   ✓ Remove existing footwear\n" : ""}
3. **DRESS the person by placing garments ON their body:**
   ${topGSURL ? `   ✓ The TOP goes ON upper body (shoulders, chest, arms) - fitted and worn${outerwearGSURL ? " as the INNER LAYER under the outerwear" : ""}\n` : ""}${outerwearGSURL ? `   ✓ The OUTERWEAR/JACKET goes ON upper body as the OUTER LAYER${topGSURL ? " worn over the new inner top from the catalog" : " worn over the person's EXISTING inner top/shirt — that inner top is LOCKED and must not change"}. Show lapels, collar, and jacket details.\n` : ""}${outerwearGSURL && !topGSURL ? `   🚨 CRITICAL INNER TOP RULE: The shirt/top the person is wearing in the FIRST image is LOCKED. You are ONLY adding the new jacket on top. The inner top's exact color, pattern, neckline, and style must be identical in the output. If the person wears a white shirt, the output shows a white shirt. If they wear a blue shirt, the output shows a blue shirt. NO exceptions.\n` : ""}${bottomGSURL ? "   ✓ The BOTTOM goes ON lower body (waist, hips, legs) - fitted and worn\n" : ""}${shoesGSURL ? "   ✓ The SHOES go ON feet (at the bottom of legs, on the ground) - worn on feet\n" : ""}${dressGSURL ? "   ✓ The DRESS goes ON full body (torso to legs) - fitted and worn\n" : ""}
4. **Ensure realistic clothing integration:**
   - Garments conform to body contours and anatomy
   - Natural folds at joints (elbows, knees, waist)
   - Proper layering: ${outerwearGSURL && topGSURL ? "outerwear over top, " : ""}top over pants, pants over shoes
   - Shadows and highlights match body movement
   ${outerwearGSURL ? "   - Outerwear collar, lapels, and cuffs are visible and realistic\n" : ""}${outerwearGSURL ? `   - The inner top/shirt is subtly visible at the collar and cuffs of the jacket — ${topGSURL ? "it should match the new top from the catalog" : "it must be the EXACT same color and style as in the FIRST image (do NOT change it to black or any other color)"}\n` : ""}${shoesGSURL ? "   - Shoes make contact with ground beneath feet\n" : ""}
5. **Final composition check:**
   - Frame shows ONLY the dressed person
   - Clean studio background (light gray #f0f0f0)
   - Person centered in frame
   - NO extra objects, NO separate garment displays

---

${
  outerwearGSURL
    ? `**🧥 OUTERWEAR - SPECIAL ATTENTION REQUIRED:**
The reference catalog shows a JACKET/COAT/BLAZER. This is the OUTER layer garment.

IN YOUR OUTPUT:
✓ Outerwear must be WORN on the person's upper body as the outermost layer
✓ Jacket/coat must cover the shoulders, arms, and torso
✓ Show realistic jacket details: lapels, collar, buttons/zipper, pockets, cuffs
${
  topGSURL
    ? "✓ The new inner top from the catalog should be subtly visible at the collar and cuffs — natural layering"
    : `✓ The person's ORIGINAL inner shirt/top from the FIRST image must appear UNCHANGED underneath the jacket
✓ The inner shirt's color visible at the collar/cuffs must exactly match the FIRST image
✗ FORBIDDEN: Do NOT change the inner shirt to black, white, or any other color
✗ FORBIDDEN: Do NOT replace the inner shirt with a generic or default shirt
✗ FORBIDDEN: Do NOT invent a new inner garment`
}
✗ DO NOT show the outerwear as a separate item
✗ The person should look like they're WEARING the jacket, not holding it

Think: "This person put on this jacket over what they were already wearing. Nothing underneath changed."

---

`
    : ""
}**🔴 SHOES - SPECIAL ATTENTION REQUIRED:**
${
  shoesGSURL
    ? `The reference catalog shows shoes in one of the grid boxes. This is ONLY for reference.

IN YOUR OUTPUT:
✓ Shoes must be WORN on the person's feet
✓ Shoes must be at the BOTTOM OF THE LEGS where feet touch the ground
✓ Shoes are PART OF the dressed person, not a separate display
✗ DO NOT show shoes as a separate item anywhere in the image
✗ DO NOT replicate the grid layout
✗ The person should look like they're WEARING the shoes, not standing near a shoe display

Think: "This person walked into the photo studio already wearing these shoes."`
    : ""
}

---

**FINAL VERIFICATION BEFORE OUTPUT:**
□ Does the image show ONLY ONE person? (MUST be YES)
□ Is the person wearing ALL referenced garments? (MUST be YES)
${outerwearGSURL ? "□ Is the OUTERWEAR worn as the outer layer on the upper body? (MUST be YES)\n" : ""}${outerwearGSURL && !topGSURL ? "□ Does the inner top/shirt match the person's ORIGINAL shirt from the FIRST image? (MUST be YES — do NOT invent a new one)\n" : ""}${shoesGSURL ? "□ Are shoes WORN on the person's feet, not shown separately? (MUST be YES)\n" : ""}□ Are there ANY garments displayed outside/below/beside the person? (MUST be NO)
□ Does this look like a FASHION PHOTO, not a product catalog? (MUST be YES)
□ Is the composition completely different from the reference layout? (MUST be YES)

---

**FORBIDDEN OUTPUTS:**
✗ Grid layout (catalog style)
✗ Any garment shown separately from the person
✗ Shoes or any item displayed separately anywhere
✗ Multi-panel composition
✗ Any visual similarity to the catalog reference layout
✗ Duplicate displays (e.g., shoes on feet AND shown separately)
${outerwearGSURL && !topGSURL ? "✗ Changing the color, style, or design of the inner shirt/top the person was wearing in the FIRST image\n✗ Replacing the original inner shirt with a black, white, or any other generic tshirt\n" : ""}
**REQUIRED OUTPUT:**
A single, clean fashion photograph showing ONE person standing naturally, fully dressed in ALL the referenced garments as a complete coordinated outfit. The entire image contains ONLY the dressed person against a clean studio background. Nothing else.
`;
      } else if (garmentCategory === "TOP") {
        categorySpecificInstructions = `
**GARMENT TYPE: ${garmentCategoryName}**

**YOUR TASK:**
The SECOND image shows a TOP (shirt/t-shirt/blouse/jacket). You must apply this top to the person.

**IMPORTANT - WHAT TO DO:**
1. The person in the FIRST image may already be wearing pants/bottoms/shoes - KEEP THESE UNCHANGED
2. If they already have a top/shirt, REMOVE it completely
3. ADD the new top from the SECOND image to the person's upper body
4. The top must fit naturally on their torso, arms, and shoulders
5. Ensure the top has realistic folds, shadows, and wrinkles
6. The top MUST be clearly visible in the final image

**CRITICAL:** 
- DO NOT remove or change any pants, bottoms, or shoes the person is wearing
- ONLY change the upper body clothing
- The final image should show: NEW TOP + existing bottom (if any) + existing shoes (if any)`;
      } else if (garmentCategory === "BOTTOM") {
        categorySpecificInstructions = `
**GARMENT TYPE: ${garmentCategoryName}**

**YOUR TASK:**
The SECOND image shows BOTTOMS (pants/trousers/jeans/shorts). You must apply these bottoms to the person.

**IMPORTANT - WHAT TO DO:**
1. The person in the FIRST image may already be wearing a top/shirt/shoes - KEEP THESE UNCHANGED
2. If they already have pants/bottoms, REMOVE them completely
3. ADD the new bottoms from the SECOND image to the person's lower body
4. The bottoms must fit naturally on their legs, hips, and waist
5. Ensure the bottoms have realistic folds, shadows, and wrinkles
6. The bottoms MUST be clearly visible in the final image

**CRITICAL:** 
- DO NOT remove or change any top, shirt, or shoes the person is wearing
- ONLY change the lower body clothing (pants area)
- The final image should show: existing top (if any) + NEW BOTTOMS + existing shoes (if any)`;
      } else if (garmentCategory === "DRESS") {
        categorySpecificInstructions = `
**GARMENT TYPE: ${garmentCategoryName}**

**YOUR TASK:**
The SECOND image shows a DRESS (full-body garment). You must apply this dress to the person.

**🚨 CRITICAL - COMPLETE CLOTHING REMOVAL REQUIRED:**
The person in the FIRST image is currently wearing a TOP and/or BOTTOM. These MUST be COMPLETELY REMOVED before applying the dress.

**STEP-BY-STEP EXECUTION:**

**STEP 1: STRIP THE PERSON (CRITICAL)**
✓ Identify all existing TOP clothing (shirts, blouses, t-shirts, jackets, etc.) on the upper body
✓ COMPLETELY REMOVE these items - erase them entirely from the person's body
✓ Identify all existing BOTTOM clothing (pants, trousers, jeans, shorts, skirts, etc.) on the lower body
✓ COMPLETELY REMOVE these items - erase them entirely from the person's body
✓ Reveal the person's natural body shape underneath (torso, arms, legs)
✓ DO NOT leave any trace of the previous clothing items

**STEP 2: VERIFY COMPLETE REMOVAL**
□ Can you see ANY trace of the previous top/shirt? (MUST be NO)
□ Can you see ANY trace of the previous bottom/pants? (MUST be NO)
□ Is the person's body completely free of upper and lower body clothing? (MUST be YES)
□ Are only the person's natural body contours visible? (MUST be YES)

**STEP 3: APPLY THE NEW DRESS**
✓ Take the dress design from the SECOND image
✓ Place it ON the person's now-bare body
✓ The dress should cover both upper body (torso, chest, arms) and lower body (waist, hips, legs)
✓ Ensure the dress fits naturally with realistic folds, shadows, and wrinkles
✓ The dress fabric should conform to the person's body shape
✓ The dress MUST be the ONLY clothing item visible on the torso and legs

**STEP 4: FINALIZE**
✓ KEEP shoes if present (shoes are independent of dress)
✓ Ensure proper lighting, shadows, and highlights on the dress
✓ Verify the dress looks natural and professionally fitted

**CRITICAL VERIFICATION BEFORE OUTPUT:**
□ Is there ANY visible top/shirt under or showing through the dress? (MUST be NO)
□ Is there ANY visible bottom/pants under or showing through the dress? (MUST be NO)
□ Is the dress the ONLY clothing covering the torso and legs? (MUST be YES)
□ Does this look like a person wearing ONLY a dress (and shoes)? (MUST be YES)

**FORBIDDEN - THESE ARE ERRORS:**
✗ Leaving any previous top visible (even partially)
✗ Leaving any previous bottom visible (even partially)
✗ Showing any clothing items beneath the dress
✗ Any trace of shirts, blouses, pants, trousers under the dress
✗ Layering the dress over existing clothing

**REQUIRED OUTPUT:**
A person wearing ONLY the new dress (covering both upper and lower body) and shoes (if previously present). NO other clothing items should be visible. The previous top and bottom must be COMPLETELY GONE.

**REMEMBER:** A dress is a REPLACEMENT for both top AND bottom. You cannot wear a dress over a shirt and pants. The person must be stripped of all torso and leg clothing before the dress is applied.`;
      } else if (garmentCategory === "SHOES") {
        categorySpecificInstructions = `
**GARMENT TYPE: ${garmentCategoryName}**

**YOUR TASK:**
The SECOND image shows SHOES/FOOTWEAR. You must apply these shoes to the person.

**IMPORTANT - WHAT TO DO:**
1. The person in the FIRST image may already be wearing tops/bottoms - KEEP THESE UNCHANGED
2. If they already have shoes, REMOVE them completely
3. ADD the new shoes from the SECOND image to the person's feet
4. The shoes must look natural on their feet and match the floor/ground
5. Ensure proper shadows and perspective
6. The shoes MUST be clearly visible in the final image

**CRITICAL:** 
- DO NOT remove or change any tops or bottoms the person is wearing
- ONLY change the footwear
- The final image should show: existing top (if any) + existing bottom (if any) + NEW SHOES`;
      } else {
        // Multiple items - use generic prompt
        categorySpecificInstructions = `
**GARMENT TYPE: MULTIPLE ITEMS**

**YOUR TASK:**
You are applying multiple clothing items simultaneously. Analyze the SECOND image to identify what garments are shown.

**IMPORTANT - WHAT TO DO:**
1. Identify all garment types in the SECOND image
2. For each garment type, replace the corresponding item on the person
3. Preserve any clothing categories not being replaced
4. Ensure all new garments fit naturally and are clearly visible
5. Maintain realistic folds, shadows, and proportions`;
      }

      const prompt = `${baseInstructions}

${categorySpecificInstructions}

**FINAL STEP-BY-STEP PROCESS:**
1. Analyze the FIRST image - this is your base (the person who will be dressed)
2. Analyze the SECOND image - these are the garment(s) to apply
3. Mentally identify which body parts need new clothing
4. Remove existing clothing from those body parts only
5. DRESS the person by placing each new garment ONTO their body:
   - Fit garments to body contours (shoulders, chest, waist, hips, legs, feet)
   - Create natural contact points and pressure areas
   - Add realistic folds where fabric bends (elbows, knees, waist)
   - Ensure proper layering (top over pants, pants into shoes, etc.)
6. Adjust lighting and shadows for realism
7. Verify the person looks fully dressed in a complete, coordinated outfit

**QUALITY CHECK - The output must show:**
✓ A person wearing ALL new garments as ONE cohesive outfit
✓ Garments fitted and worn naturally on the body
✓ Proper coverage - no "naked" areas that should be covered
✓ Clean composition - ONLY the dressed person, no extra items visible
✓ Shoes (if applicable) WORN on the person's feet, NOT displayed separately

**CRITICAL OUTPUT REQUIREMENT - READ CAREFULLY:**
${
  isBatchMode
    ? `The reference image (SECOND image) is a PRODUCT CATALOG showing items in separate vertical sections. Your job is NOT to recreate that layout. Your job is to create a COMPLETELY DIFFERENT image type: a FASHION PHOTOGRAPH of ONE person wearing ALL those items.

REFERENCE IMAGE TYPE = Product catalog with separate sections (top section, middle section, bottom section)
YOUR OUTPUT IMAGE TYPE = Fashion photograph with ONE dressed person

Do NOT copy the catalog layout. Do NOT show any items in separate sections. Do NOT show shoes or any garment outside/below the person's body. The person should be wearing the shoes ON their feet as part of their complete outfit.`
    : `The reference image (SECOND image) shows the garment item to apply. Your job is to dress the person in this garment.`
}

**MANDATORY OUTPUT VERIFICATION:**
Before returning, check:
□ Only ONE person visible? (MUST be YES)
□ Person wearing ALL garments ON their body? (MUST be YES)  
□ Any items shown separately/floating/below person? (MUST be NO)
${isBatchMode && shoesGSURL ? "□ Shoes worn ON person's feet, not shown separately below? (MUST be YES)\n" : ""}□ Looks like fashion photo, not product catalog? (MUST be YES)
□ Image composition completely different from reference? ${isBatchMode ? "(MUST be YES)" : "(N/A)"}

**OUTPUT:** Return ONLY a single photorealistic fashion photograph: the person from image 1, fully dressed in ${isBatchMode ? "all garments" : "the garment"} from image 2, centered, clean background. NO separate garment displays. NO catalog layout. ${isBatchMode && shoesGSURL ? "NO shoes shown separately. " : ""}JUST THE DRESSED PERSON.`;

      if (hasGarmentInputs) {
        // Generate try-on image using Gemini API (not Vertex AI)
        const maxRetries = 5;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await job.log(
              `Generating virtual try-on (attempt ${attempt}/${maxRetries})...`,
            );

            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash-image",
              contents: [
                { text: prompt },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: modelImageBase64,
                  },
                },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: garmentImageBase64,
                  },
                },
              ],
              config: {
                responseModalities: [Modality.IMAGE, Modality.TEXT],
              },
            });

            // Extract image from response
            if (response?.candidates?.[0]?.content?.parts) {
              for (const part of response.candidates[0].content.parts) {
                if (part.inlineData?.data) {
                  imageBuffer = Buffer.from(part.inlineData.data, "base64");
                  imageMimeType = part.inlineData.mimeType || "image/png";
                  await job.log(
                    `Image generated successfully (${imageMimeType})`,
                  );
                  break;
                }
              }
            }

            if (imageBuffer) {
              await job.log(
                `✓ Generated image successfully on attempt ${attempt}`,
              );
              break;
            } else {
              await job.log(
                `⚠ No image generated on attempt ${attempt}, will retry...`,
              );
            }
          } catch (apiError: any) {
            const isRateLimitError =
              apiError?.message?.includes("429") ||
              apiError?.message?.includes("RESOURCE_EXHAUSTED");

            const isSafetyError =
              apiError?.message?.includes("SAFETY") ||
              apiError?.message?.includes("blocked") ||
              apiError?.message?.includes("RECITATION");

            await job.log(
              `✗ API error on attempt ${attempt}: ${
                apiError?.message || "Unknown error"
              }`,
            );

            if (isSafetyError) {
              await job.log(
                `Safety filter triggered. This may be due to the clothing item or pose. Retrying with variation...`,
              );
              // Add small delay and retry with slightly varied approach
              if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
              }
            } else if (isRateLimitError && attempt < maxRetries) {
              const delayMs = 10000 * Math.pow(2, attempt - 1);
              await job.log(
                `Rate limit hit, retrying in ${delayMs / 1000}s...`,
              );
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            } else if (attempt === maxRetries) {
              throw apiError;
            } else {
              // General error, short delay before retry
              await new Promise((resolve) => setTimeout(resolve, 3000));
            }
          }
        }
      }

      if (!imageBuffer) {
        throw new Error(
          "No image was generated by the AI model. The AI service may be experiencing issues or the request may have been blocked by safety filters.",
        );
      }

      await job.log(
        `Image generation completed. Note: AI results can vary - if the garment wasn't applied correctly, this is a limitation of the AI model.`,
      );

      // Apply accessories one by one using Gemini editing pass (no Vertex AI)
      if (accessoryItems.length > 0) {
        await job.log(
          `Applying ${accessoryItems.length} accessory item(s) to generated outfit...`,
        );

        for (let i = 0; i < accessoryItems.length; i++) {
          const accessory = accessoryItems[i];

          await job.log(
            `Applying accessory ${i + 1}/${accessoryItems.length}: ${accessory.category}`,
          );

          const accessoryBase64 = await downloadAndConvertToBase64(
            accessory.url,
          );

          const editPrompt = buildAccessoryEditPrompt(
            accessory.category,
            accessory.description || "",
          );

          const promptText = `${baseInstructions}

ACCESSORY EDIT MODE OVERRIDE (READ CAREFULLY):
- Do NOT perform garment replacement in this step.
- Do NOT change any existing top, bottom, dress, outerwear, or shoes.
- Do NOT alter identity, pose, framing, or background.
- This step is accessory-only editing on the already generated outfit image.

${editPrompt}

Main image to edit (add accessory to this person):`;

          const maxAccessoryRetries = 3;
          let editedImageBuffer: Buffer | null = null;

          for (let attempt = 1; attempt <= maxAccessoryRetries; attempt++) {
            try {
              const response = await ai.models.generateContent({
                model: "gemini-2.5-flash-image",
                contents: [
                  { text: promptText },
                  {
                    inlineData: {
                      mimeType: imageMimeType || "image/png",
                      data: imageBuffer.toString("base64"),
                    },
                  },
                  { text: "Reference accessory image to add:" },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: accessoryBase64,
                    },
                  },
                ],
                config: {
                  responseModalities: [Modality.IMAGE, Modality.TEXT],
                },
              });

              if (response?.candidates?.[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                  if (part.inlineData?.data) {
                    editedImageBuffer = Buffer.from(
                      part.inlineData.data,
                      "base64",
                    );
                    imageMimeType = part.inlineData.mimeType || "image/png";
                    break;
                  }
                }
              }

              if (editedImageBuffer) {
                break;
              }
            } catch (accessoryError: any) {
              await job.log(
                `Accessory edit error for ${accessory.category} (attempt ${attempt}/${maxAccessoryRetries}): ${accessoryError?.message || "Unknown error"}`,
              );
              if (attempt === maxAccessoryRetries) {
                throw accessoryError;
              }
              const delayMs = 3000 * Math.pow(2, attempt - 1);
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
          }

          if (!editedImageBuffer) {
            throw new Error(
              `Failed to apply accessory ${accessory.category}: No image returned from Gemini`,
            );
          }

          imageBuffer = editedImageBuffer;
          await job.log(
            `Accessory ${i + 1}/${accessoryItems.length} applied successfully`,
          );
        }
      }

      await job.updateProgress(60);
      await job.log("Applying background removal...");

      // Apply background removal
      try {
        const base64Image = `data:${imageMimeType};base64,${imageBuffer.toString(
          "base64",
        )}`;
        await job.log(
          `Sending image to remove.bg (size: ${Math.round(
            imageBuffer.length / 1024,
          )}KB)...`,
        );
        const resultBase64 = await removeBackgroundFromBase64(base64Image, {
          background: "transparent",
        });
        const base64Data = resultBase64.split(",")[1] || resultBase64;
        imageBuffer = Buffer.from(base64Data, "base64");
        await job.log(
          `Background removal completed (new size: ${Math.round(
            imageBuffer.length / 1024,
          )}KB)`,
        );
      } catch (bgError: any) {
        await job.log(
          `Background removal failed: ${bgError.message}, using original image`,
        );
        console.error(
          "Background removal error details:",
          bgError,
          process.env.REMOVE_BG_API_KEY,
        );
      }

      await job.updateProgress(70);
      await job.log("Centering and standardizing image...");

      // Apply automatic centering and standardization
      try {
        imageBuffer = await centerAndStandardizeImage(imageBuffer);
        await job.log("✅ Image centered and standardized successfully");
      } catch (centerError: any) {
        await job.log(
          `⚠️ Centering failed, using original image: ${centerError.message}`,
        );
      }

      await job.updateProgress(80);
      await job.log("Uploading to GCS...");

      // Prepare outfit data
      let finalTopId = receivedTopId;
      let finalBottomId = receivedBottomId;
      let finalShoeId = receivedShoesId;
      let finalDressId = receivedDressId;
      let finalOuterwearId = receivedOuterwearId;

      // Handle dress and top/bottom/outerwear mutual exclusivity
      if (finalDressId && finalDressId > 0) {
        // Dress replaces top, bottom, and outerwear
        finalTopId = 0;
        finalBottomId = 0;
        finalOuterwearId = 0;
        await job.log("Dress detected - removing top, bottom, and outerwear");
      } else if (
        (finalTopId && finalTopId > 0) ||
        (finalBottomId && finalBottomId > 0) ||
        (finalOuterwearId && finalOuterwearId > 0)
      ) {
        // If any of top/bottom/outerwear is present, remove dress
        finalDressId = 0;
        await job.log("Top/bottom/outerwear detected - removing dress");
      }

      await job.log(
        `Creating outfit (Top:${finalTopId} Outerwear:${finalOuterwearId} Bottom:${finalBottomId} Shoes:${finalShoeId} Dress:${finalDressId})`,
      );

      // Generate a unique filename using timestamp and user ID
      const fileName = `outfit_${userId}_${Date.now()}.png`;

      // Upload to GCS
      const uploadResult = await gcsService.uploadFile(
        imageBuffer,
        fileName,
        userId.toString(),
        `VirtualTryOn`,
        "image/png",
      );

      await job.updateProgress(90);
      await job.log("Saving outfit to database...");

      const accessoryUrls = accessoryItems
        .map((item) => item.url)
        .filter((url): url is string => !!url);

      const accessoryIds = await resolveAccessoryApparelIdsByUrls(
        userId,
        accessoryUrls,
      );

      await job.log(
        `Resolved ${accessoryIds.length} accessory ID(s) for outfit persistence`,
      );

      // Save outfit to database - let the database auto-generate the ID
      const outfitData: any = {
        userId: userId,
        topId: finalTopId,
        bottomId: finalBottomId,
        shoeId: finalShoeId,
        dressId: finalDressId,
        outerwearId: finalOuterwearId,
        hasAccessories: hasAccessoryInputs,
        accessoryIds,
        visible: false,
        primaryImageUrl: uploadResult.httpUrl,
      };

      const createdOutfit = await Outfit.create(outfitData);
      const finalOutfitId = createdOutfit.id; // Get the auto-generated ID

      await job.updateProgress(100);
      await job.log("Virtual try-on completed successfully");

      console.log(
        `✅ Virtual try-on completed for user ${userId}, outfit ID: ${finalOutfitId}`,
      );

      return {
        success: true,
        message: "Virtual try-on completed successfully",
        imageBase64: imageBuffer.toString("base64"),
        savedFileName: fileName,
        downloadUrl: uploadResult.httpUrl,
        outfitId: finalOutfitId,
      };
    } catch (error) {
      await job.log(
        `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5, // Higher concurrency - single API call per job
  },
);

// ============================================
// Event Listeners
// ============================================
virtualTryOnWorker.on("completed", (job: Job, returnValue: any) => {
  console.log(`✅ Virtual Try-On Job ${job.id} completed successfully`);
});

virtualTryOnWorker.on("failed", (job: any, err: Error) => {
  console.error(`❌ Virtual Try-On Job ${job?.id} failed: ${err.message}`);
});

virtualTryOnWorker.on("error", (err: Error) => {
  console.error(`❌ Virtual Try-On Worker error: ${err.message}`);
});

// ============================================
// Function to Add Jobs to Queue
// ============================================
export const addVirtualTryOnJob = async (data: any) => {
  try {
    const job = await virtualTryOnQueue.add("virtualTryOn", data, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 5000,
      },
      removeOnComplete: {
        age: 3600,
        count: 1000,
      },
      removeOnFail: {
        age: 86400,
      },
    });

    console.log(`📋 Virtual Try-On job added to queue with ID: ${job.id}`);
    return job.id;
  } catch (error) {
    console.error("Error adding virtual try-on job to queue:", error);
    throw error;
  }
};
