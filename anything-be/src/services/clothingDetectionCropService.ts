import sharp from "sharp";
import {
  BoundingBox,
  ClarifaiClothingDetectionService,
  ClothingRegion,
} from "./clarifai/clothing-detection";
import { gcsService } from "./gcsService";
import { removeBackgroundFromBase64 } from "./backgroundRemovalService";

export interface CroppedImage {
  regionId: number;
  conceptName: string;
  confidence: number;
  boundingBox: BoundingBox;
  croppedImageUrl: string;
  fileName: string;
  // Note: Buffers are NOT stored - always download from URL when needed for memory efficiency
}

export interface ClothingDetectionWithCropsResult {
  success: boolean;
  message?: string;
  totalRegions: number;
  croppedImages: CroppedImage[];
  originalFileName?: string;
  originalImageUrl?: string;
}

export class ClothingDetectionCropService {
  private clarifaiService: ClarifaiClothingDetectionService;

  // Configurable confidence threshold - items below this confidence will not be cropped
  private readonly CONFIDENCE_THRESHOLD = 40; // Set to 50% by default, can be changed here

  constructor() {
    this.clarifaiService = new ClarifaiClothingDetectionService();
  }

  /**
   * Download image from URL and convert to base64
   */
  private async downloadImageFromUrl(
    imageUrl: string,
  ): Promise<{ buffer: Buffer; base64: string; fileName: string }> {
    try {
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to download image: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");

      // Extract filename from URL or create a default one
      let fileName = "image.jpg";
      try {
        const url = new URL(imageUrl);
        const pathParts = url.pathname.split("/");
        const lastPart = pathParts[pathParts.length - 1];
        if (lastPart && lastPart.includes(".")) {
          fileName = lastPart;
        }
      } catch (e) {
        // Use default filename if URL parsing fails
      }

      return { buffer, base64, fileName };
    } catch (error) {
      throw new Error(
        `Error downloading image: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }
  }

  /**
   * Calculate bounding box area for comparison
   */
  private calculateBoundingBoxArea(boundingBox: BoundingBox): number {
    const width = boundingBox.rightCol - boundingBox.leftCol;
    const height = boundingBox.bottomRow - boundingBox.topRow;
    return width * height;
  }

  /**
   * Apply early deduplication to regions BEFORE cropping/uploading
   * This saves API costs and cloud storage by filtering duplicates early
   */
  private deduplicateRegions(regions: ClothingRegion[]): ClothingRegion[] {
    if (regions.length === 0) return regions;

    console.log(
      `\n🔍 [EARLY-DEDUP] Checking ${regions.length} detected regions for duplicates...`,
    );

    // Group regions by category (concept name)
    const regionsByCategory: { [key: string]: ClothingRegion[] } = {};

    for (const region of regions) {
      const primaryConcept = region.concepts[0];
      if (!primaryConcept) continue;

      const conceptName = primaryConcept.name.toLowerCase();

      // Map concept names to categories (same logic as in apparelService)
      let category: string;
      if (conceptName.includes("dress") || conceptName.includes("gown")) {
        category = "dress";
      } else if (
        conceptName.includes("top") ||
        conceptName.includes("shirt") ||
        conceptName.includes("blouse") ||
        conceptName.includes("t-shirt") ||
        conceptName.includes("sweater") ||
        conceptName.includes("hoodie")
      ) {
        category = "top";
      } else if (
        conceptName.includes("outerwear") ||
        conceptName.includes("jacket") ||
        conceptName.includes("coat") ||
        conceptName.includes("blazer")
      ) {
        category = "outerwear"; // Outerwear is also mapped to "top" category
      } else if (
        conceptName.includes("bottom") ||
        conceptName.includes("pants") ||
        conceptName.includes("jeans") ||
        conceptName.includes("shorts") ||
        conceptName.includes("skirt") ||
        conceptName.includes("trouser")
      ) {
        category = "bottom";
      } else if (
        conceptName.includes("shoes") ||
        conceptName.includes("footwear")
      ) {
        category = "shoes";
      } else {
        category = "other";
      }

      if (!regionsByCategory[category]) {
        regionsByCategory[category] = [];
      }
      regionsByCategory[category].push(region);
    }

    console.log(
      `   Items by category: ${Object.entries(regionsByCategory)
        .map(([cat, items]) => `${cat}: ${items.length}`)
        .join(", ")}`,
    );

    // Keep only the best region per category
    const regionsToKeep: ClothingRegion[] = [];
    let duplicatesRemoved = 0;

    for (const [category, categoryRegions] of Object.entries(
      regionsByCategory,
    )) {
      if (categoryRegions.length === 1) {
        // Only one item in this category - keep it
        regionsToKeep.push(categoryRegions[0]);
        continue;
      }

      // Multiple items in same category - select the best one
      console.log(
        `\n   🔄 Multiple ${category}s detected (${categoryRegions.length}). Selecting best one...`,
      );

      // Score each region: confidence (60%) + area (40%)
      const regionsWithScores = categoryRegions.map((region) => {
        const primaryConcept = region.concepts[0];
        const confidence = primaryConcept?.confidence || 0;
        const area = this.calculateBoundingBoxArea(region.boundingBox);
        const score = confidence * 0.6 + area * 100 * 0.4;

        return {
          region,
          confidence,
          area,
          score,
          conceptName: primaryConcept?.name || "unknown",
        };
      });

      // Sort by score descending
      regionsWithScores.sort((a, b) => b.score - a.score);

      // Keep the best one
      const best = regionsWithScores[0];
      regionsToKeep.push(best.region);
      console.log(
        `      ✅ Keeping: ${best.conceptName} (confidence: ${best.confidence}%, area: ${best.area.toFixed(4)}, score: ${best.score.toFixed(1)})`,
      );

      // Log the ones being filtered out
      for (let i = 1; i < regionsWithScores.length; i++) {
        const duplicate = regionsWithScores[i];
        console.log(
          `      ⏭️  Skipping duplicate: ${duplicate.conceptName} (confidence: ${duplicate.confidence}%, area: ${duplicate.area.toFixed(4)}, score: ${duplicate.score.toFixed(1)})`,
        );
        duplicatesRemoved++;
      }
    }

    console.log(
      `✅ [EARLY-DEDUP] Filtered to ${regionsToKeep.length} unique items (removed ${duplicatesRemoved} duplicates)`,
    );
    console.log(
      `   💰 Saved: ${duplicatesRemoved * 2} background removal operations, ${duplicatesRemoved} OpenAI API calls, ${duplicatesRemoved} database inserts\n`,
    );

    return regionsToKeep;
  }

  /**
   * Crop image regions based on bounding boxes
   */
  private async cropImageRegions(
    imageBuffer: Buffer,
    regions: ClothingRegion[],
    userId: string,
    originalFileName: string,
  ): Promise<CroppedImage[]> {
    const croppedImages: CroppedImage[] = [];
    let filteredByConfidence = 0;

    // Get image dimensions
    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    if (!imageWidth || !imageHeight) {
      throw new Error("Unable to determine image dimensions");
    }

    console.log(`Image dimensions: ${imageWidth}x${imageHeight}`);

    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const primaryConcept = region.concepts[0]; // Use the highest confidence concept

      if (!primaryConcept) continue;

      // Skip items with confidence below threshold
      if (primaryConcept.confidence < this.CONFIDENCE_THRESHOLD) {
        console.log(
          `⚠️ Skipping region ${i + 1}: ${primaryConcept.name} (${
            primaryConcept.confidence
          }% confidence < ${this.CONFIDENCE_THRESHOLD}% threshold)`,
        );
        filteredByConfidence++;
        continue;
      }

      // Convert normalized coordinates to pixel coordinates
      const left = Math.floor(region.boundingBox.leftCol * imageWidth);
      const top = Math.floor(region.boundingBox.topRow * imageHeight);
      const width = Math.floor(
        (region.boundingBox.rightCol - region.boundingBox.leftCol) * imageWidth,
      );
      const height = Math.floor(
        (region.boundingBox.bottomRow - region.boundingBox.topRow) *
          imageHeight,
      );

      // Ensure coordinates are within image bounds
      const safeLeft = Math.max(0, left);
      const safeTop = Math.max(0, top);
      const safeWidth = Math.min(width, imageWidth - safeLeft);
      const safeHeight = Math.min(height, imageHeight - safeTop);

      if (safeWidth <= 0 || safeHeight <= 0) {
        console.warn(`Skipping region ${i}: Invalid dimensions`);
        continue;
      }

      try {
        // Crop the image
        const croppedBuffer = await sharp(imageBuffer)
          .extract({
            left: safeLeft,
            top: safeTop,
            width: safeWidth,
            height: safeHeight,
          })
          .png()
          .toBuffer();

        // Apply background removal to the cropped image
        console.log(
          `🎨 Applying background removal to ${primaryConcept.name}...`,
        );
        let finalBuffer = croppedBuffer;

        try {
          const croppedBase64 = `data:image/png;base64,${croppedBuffer.toString(
            "base64",
          )}`;

          const bgRemovedBase64 = await removeBackgroundFromBase64(
            croppedBase64,
            { background: "transparent" },
          );

          // Convert back to buffer
          const base64Data = bgRemovedBase64.split(",")[1] || bgRemovedBase64;
          finalBuffer = Buffer.from(base64Data, "base64");

          console.log(`✅ Background removed for ${primaryConcept.name}`);
        } catch (bgError: any) {
          console.error(
            `⚠️ Background removal failed for ${primaryConcept.name}, using original:`,
            bgError.message,
          );
          // Continue with original cropped image if background removal fails
        }

        // Create filename for cropped image
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const croppedFileName = `cropped_${primaryConcept.name}_${
          i + 1
        }_${timestamp}_${originalFileName.split(".")[0]}.png`;

        // Upload to GCS under user's Apparels/Raw folder
        const uploadResult = await gcsService.uploadFile(
          finalBuffer,
          croppedFileName,
          userId,
          "AddOutfit/Raw",
          "image/png",
        );

        croppedImages.push({
          regionId: i + 1,
          conceptName: primaryConcept.name,
          confidence: primaryConcept.confidence,
          boundingBox: region.boundingBox,
          croppedImageUrl: uploadResult.httpUrl,
          fileName: croppedFileName,
          // Buffer NOT included - will be downloaded from GCS URL when needed
        });

        console.log(
          `✅ Cropped and uploaded: ${primaryConcept.name} (${primaryConcept.confidence}% confidence)`,
        );
      } catch (error) {
        console.error(`Error cropping region ${i}:`, error);
        // Continue with other regions even if one fails
      }
    }

    // Log summary of filtering
    if (filteredByConfidence > 0) {
      console.log(
        `🔍 Confidence filtering summary: ${filteredByConfidence} regions skipped due to confidence < ${this.CONFIDENCE_THRESHOLD}%`,
      );
    }

    return croppedImages;
  }

  /**
   * Variant of cropImageRegions that, when a single region carries both an
   * "outerwear" concept and a "top" concept, emits TWO separate CroppedImage
   * entries (same uploaded image URL, different conceptName / regionId).
   * All other regions are handled identically to the original method.
   */
  private async cropImageRegionsKeepBoth(
    imageBuffer: Buffer,
    regions: ClothingRegion[],
    userId: string,
    originalFileName: string,
  ): Promise<CroppedImage[]> {
    const croppedImages: CroppedImage[] = [];
    let filteredByConfidence = 0;
    let regionCounter = 0;

    const metadata = await sharp(imageBuffer).metadata();
    const imageWidth = metadata.width || 0;
    const imageHeight = metadata.height || 0;

    if (!imageWidth || !imageHeight) {
      throw new Error("Unable to determine image dimensions");
    }

    console.log(`Image dimensions: ${imageWidth}x${imageHeight}`);

    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const primaryConcept = region.concepts[0];

      if (!primaryConcept) continue;

      if (primaryConcept.confidence < this.CONFIDENCE_THRESHOLD) {
        console.log(
          `⚠️ Skipping region ${i + 1}: ${primaryConcept.name} (${
            primaryConcept.confidence
          }% confidence < ${this.CONFIDENCE_THRESHOLD}% threshold)`,
        );
        filteredByConfidence++;
        continue;
      }

      const left = Math.floor(region.boundingBox.leftCol * imageWidth);
      const top = Math.floor(region.boundingBox.topRow * imageHeight);
      const width = Math.floor(
        (region.boundingBox.rightCol - region.boundingBox.leftCol) * imageWidth,
      );
      const height = Math.floor(
        (region.boundingBox.bottomRow - region.boundingBox.topRow) *
          imageHeight,
      );

      const safeLeft = Math.max(0, left);
      const safeTop = Math.max(0, top);
      const safeWidth = Math.min(width, imageWidth - safeLeft);
      const safeHeight = Math.min(height, imageHeight - safeTop);

      if (safeWidth <= 0 || safeHeight <= 0) {
        console.warn(`Skipping region ${i}: Invalid dimensions`);
        continue;
      }

      try {
        const croppedBuffer = await sharp(imageBuffer)
          .extract({
            left: safeLeft,
            top: safeTop,
            width: safeWidth,
            height: safeHeight,
          })
          .png()
          .toBuffer();

        console.log(
          `🎨 Applying background removal to ${primaryConcept.name}...`,
        );
        let finalBuffer = croppedBuffer;

        try {
          const croppedBase64 = `data:image/png;base64,${croppedBuffer.toString("base64")}`;
          const bgRemovedBase64 = await removeBackgroundFromBase64(
            croppedBase64,
            {
              background: "transparent",
            },
          );
          const base64Data = bgRemovedBase64.split(",")[1] || bgRemovedBase64;
          finalBuffer = Buffer.from(base64Data, "base64");
          console.log(`✅ Background removed for ${primaryConcept.name}`);
        } catch (bgError: any) {
          console.error(
            `⚠️ Background removal failed for ${primaryConcept.name}, using original:`,
            bgError.message,
          );
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const croppedFileName = `cropped_${primaryConcept.name}_${
          i + 1
        }_${timestamp}_${originalFileName.split(".")[0]}.png`;

        const uploadResult = await gcsService.uploadFile(
          finalBuffer,
          croppedFileName,
          userId,
          "AddOutfit/Raw",
          "image/png",
        );

        regionCounter++;
        croppedImages.push({
          regionId: regionCounter,
          conceptName: primaryConcept.name,
          confidence: primaryConcept.confidence,
          boundingBox: region.boundingBox,
          croppedImageUrl: uploadResult.httpUrl,
          fileName: croppedFileName,
        });

        console.log(
          `✅ Cropped and uploaded: ${primaryConcept.name} (${primaryConcept.confidence}% confidence)`,
        );

        // If this region has both "outerwear" and "top" concepts, add the
        // secondary concept as a separate entry reusing the same GCS image.
        const secondaryConcept = region.concepts[1];
        const isOuterwearTopPair =
          secondaryConcept &&
          secondaryConcept.confidence >= this.CONFIDENCE_THRESHOLD &&
          ((primaryConcept.name === "outerwear" &&
            secondaryConcept.name === "top") ||
            (primaryConcept.name === "top" &&
              secondaryConcept.name === "outerwear"));

        if (isOuterwearTopPair) {
          regionCounter++;
          croppedImages.push({
            regionId: regionCounter,
            conceptName: secondaryConcept.name,
            confidence: secondaryConcept.confidence,
            boundingBox: region.boundingBox,
            croppedImageUrl: uploadResult.httpUrl, // reuse the same GCS URL
            fileName: croppedFileName,
          });
          console.log(
            `✅ Also registering secondary outerwear/top concept from same region: ${secondaryConcept.name} (${secondaryConcept.confidence}% confidence)`,
          );
        }
      } catch (error) {
        console.error(`Error cropping region ${i}:`, error);
      }
    }

    if (filteredByConfidence > 0) {
      console.log(
        `🔍 Confidence filtering summary: ${filteredByConfidence} regions skipped due to confidence < ${this.CONFIDENCE_THRESHOLD}%`,
      );
    }

    return croppedImages;
  }

  /**
   * Detect clothing from uploaded file, crop regions, and upload to GCS
   */
  async detectAndCropClothingFromFile(
    file: Express.Multer.File,
    userId: string,
  ): Promise<ClothingDetectionWithCropsResult> {
    try {
      console.log(
        `🔍 Starting clothing detection for uploaded file: ${file.originalname}`,
      );

      // Ensure user folder exists in GCS
      await gcsService.ensureUserFolderExists(userId);

      const buffer = file.buffer;
      const base64 = buffer.toString("base64");
      const fileName = file.originalname;

      console.log(
        `📥 Processing uploaded image: ${fileName} (${buffer.length} bytes)`,
      );

      // Detect clothing using Clarifai
      const detectionResult =
        await this.clarifaiService.detectClothingFromBase64(base64);

      if (!detectionResult.success) {
        return {
          success: detectionResult.success,
          message: detectionResult.message,
          totalRegions: detectionResult.totalRegions,
          croppedImages: [],
          originalFileName: fileName,
        };
      }

      console.log(`🎯 Found ${detectionResult.totalRegions} clothing regions`);

      // Apply early deduplication BEFORE any expensive operations
      const deduplicatedRegions = this.deduplicateRegions(
        detectionResult.regions,
      );

      // Crop images and upload to GCS (only for deduplicated regions).
      // cropImageRegionsKeepBoth emits two entries when a region carries both
      // "outerwear" and "top" concepts, preserving both as separate apparel items.
      const croppedImages = await this.cropImageRegionsKeepBoth(
        buffer,
        deduplicatedRegions,
        userId,
        fileName,
      );

      console.log(
        `✂️ Successfully cropped ${croppedImages.length} images (out of ${detectionResult.totalRegions} detected regions)`,
      );

      return {
        success: true,
        message: `Clothing detection and cropping completed successfully. ${croppedImages.length} items cropped and saved (out of ${detectionResult.totalRegions} detected regions, confidence threshold: ${this.CONFIDENCE_THRESHOLD}%).`,
        totalRegions: detectionResult.totalRegions,
        croppedImages,
        originalFileName: fileName,
      };
    } catch (error) {
      console.error("Error in detectAndCropClothingFromFile:", error);
      return {
        success: false,
        message: `Error during clothing detection and cropping: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        totalRegions: 0,
        croppedImages: [],
        originalFileName: file.originalname,
      };
    }
  }
}
