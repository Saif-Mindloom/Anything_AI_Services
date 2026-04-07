import axios from "axios";
import { Accessory } from "../models/accessory.model";
import { Outfit } from "../models/outfit.model";
import { GoogleGenAI, Modality } from "@google/genai";
import { removeBackgroundFromBase64 } from "./backgroundRemovalService";
import { uploadBase64Image } from "./gcsService";
import { extractMultipleObjects } from "../queues/virtualTryOnQueue";
import { centerAndStandardizeImage } from "../helpers/imageUtils";

// Debug flag - set to 'true' to save debug images locally
const SAVE_DEBUG_IMAGES = process.env.SAVE_DEBUG_IMAGES === "true";

// Initialize Google AI client
const ai = new GoogleGenAI({
  apiKey: process.env.GOOGLE_AI_API_KEY,
});
const model = "gemini-2.5-flash-image";

// LangGraph service configuration
const LANGGRAPH_SERVICE_URL =
  process.env.LANGGRAPH_SERVICE_URL || "http://localhost:3002";
const LANGGRAPH_API_KEY = process.env.LANGGRAPH_API_KEY || "";

// All available accessory types
const ACCESSORY_TYPES = [
  "headwear",
  "eyewear",
  "necklace",
  "chain",
  "scarf",
  "ring",
  "bracelet",
  "watch",
  "belt",
  "bag",
  "earings",
] as const;

type AccessoryType = (typeof ACCESSORY_TYPES)[number];

interface AccessoryDescription {
  type: AccessoryType;
  description: string;
}

interface AccessoryDescriptionsResult {
  accessories: AccessoryDescription[];
  overallSummary: string;
}

interface GeneratedAccessory {
  id: number;
  type: AccessoryType;
  description: string;
  imageUrl: string;
  gsUtil: string;
}

/**
 * Download image from URL and convert to buffer
 */
async function downloadImageAsBuffer(url: string): Promise<Buffer> {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
  });
  return Buffer.from(response.data);
}

/**
 * Convert buffer to base64 data URL
 */
function bufferToDataUrl(
  buffer: Buffer,
  mimeType: string = "image/jpeg",
): string {
  const base64Data = buffer.toString("base64");
  return `data:${mimeType};base64,${base64Data}`;
}

/**
 * Generate outfit summary using LangGraph
 */
export async function generateOutfitSummary(
  outfitImageUrl: string,
): Promise<string> {
  try {
    console.log("🤖 Calling LangGraph to generate outfit summary...");

    const prompt = `You are a professional fashion stylist. Analyze the outfit image provided and write a concise 2-3 sentence summary of the outfit.

Your summary should:
- Describe the overall style and aesthetic (e.g., modern, minimalist, streetwear, formal, casual)
- Mention key color coordination or patterns
- Highlight what makes the outfit work well together

Keep it professional, concise, and positive. Do NOT use bullet points or formatting - just plain text sentences.

Example style: "This outfit demonstrates excellent color coordination with a modern, minimalist aesthetic. The pieces work together for a contemporary streetwear look."

Return ONLY the summary text, no additional commentary.`;

    const response = await axios.post(
      `${LANGGRAPH_SERVICE_URL}/chat`,
      {
        message: prompt,
        userId: "system",
        includeRating: false,
        imageUrl: outfitImageUrl,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": LANGGRAPH_API_KEY,
        },
        timeout: 30000,
      },
    );

    const summary = response.data.output.trim();
    console.log(`✅ Generated outfit summary: ${summary.substring(0, 100)}...`);
    return summary;
  } catch (error) {
    console.error("❌ Error generating outfit summary:", error);
    if (axios.isAxiosError(error)) {
      console.error("Response data:", error.response?.data);
    }
    // Return a default summary if generation fails
    return "A well-coordinated outfit with complementary pieces.";
  }
}

/**
 * Randomly select 3 unique accessory types
 */
function selectRandomAccessories(): AccessoryType[] {
  const shuffled = [...ACCESSORY_TYPES].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 3);
}

/**
 * Use LangGraph RAG + Vision to analyze outfit and generate accessory descriptions
 */
async function generateAccessoryDescriptions(
  outfitImageUrl: string,
  selectedTypes: AccessoryType[],
): Promise<AccessoryDescriptionsResult> {
  try {
    console.log(
      "🤖 Calling LangGraph to analyze outfit and generate accessory descriptions...",
    );

    // Create a prompt for the LLM
    const prompt = `You are a fashion AI assistant with access to fashion knowledge base (RAG) and the ability to see images.

Analyze the outfit image provided and suggest descriptions for the following ${selectedTypes.length} accessories that would complement this outfit:
${selectedTypes.map((type, idx) => `${idx + 1}. ${type.charAt(0).toUpperCase() + type.slice(1)}`).join("\n")}

For each accessory type, provide a detailed description that:
- Matches the style, colors, and vibe of the outfit
- Considers the occasion and formality level
- Describes specific design elements (materials, colors, patterns, style)
- Is detailed enough to generate an image from

Also provide an overall 2-3 sentence summary of how these accessories complement the outfit.

IMPORTANT: Return your response in the following JSON format ONLY, no additional text:
{
  "accessories": [
    {
      "type": "accessory_type_here",
      "description": "detailed description here"
    }
  ],
  "overallSummary": "2-3 sentence summary of how these accessories work together with the outfit"
}`;

    // Call LangGraph chat endpoint with image URL (not base64)
    const response = await axios.post(
      `${LANGGRAPH_SERVICE_URL}/chat`,
      {
        message: prompt,
        userId: "system", // System user for accessory generation
        includeRating: false,
        imageUrl: outfitImageUrl, // Pass URL directly, don't convert to base64
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": LANGGRAPH_API_KEY,
        },
        timeout: 60000,
      },
    );

    console.log("✅ LangGraph response received");

    // Parse the response
    const responseText = response.data.output;

    // Try to extract JSON from the response
    let parsedResponse;
    try {
      // Try direct JSON parse first
      parsedResponse = JSON.parse(responseText);
    } catch (e) {
      // If that fails, try to extract JSON from markdown code blocks
      const jsonMatch = responseText.match(
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
      );
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[1]);
      } else {
        // Try to find JSON object in the text
        const jsonObjectMatch = responseText.match(
          /\{[\s\S]*"accessories"[\s\S]*\}/,
        );
        if (jsonObjectMatch) {
          parsedResponse = JSON.parse(jsonObjectMatch[0]);
        } else {
          throw new Error("Could not extract JSON from response");
        }
      }
    }

    if (
      !parsedResponse.accessories ||
      !Array.isArray(parsedResponse.accessories)
    ) {
      throw new Error("Invalid response format from LangGraph");
    }

    // Map to AccessoryDescription format and normalize type to lowercase
    const descriptions: AccessoryDescription[] = parsedResponse.accessories.map(
      (item: any) => ({
        type: item.type.toLowerCase() as AccessoryType,
        description: item.description,
      }),
    );

    const overallSummary =
      parsedResponse.overallSummary ||
      "These accessories complement the outfit perfectly.";

    console.log(`✅ Generated ${descriptions.length} accessory descriptions`);
    console.log(
      `✅ Generated overall summary: ${overallSummary.substring(0, 100)}...`,
    );

    return {
      accessories: descriptions,
      overallSummary,
    };
  } catch (error) {
    console.error("❌ Error generating accessory descriptions:", error);
    if (axios.isAxiosError(error)) {
      console.error("Response data:", error.response?.data);
      console.error("Response status:", error.response?.status);
    }
    throw new Error("Failed to generate accessory descriptions");
  }
}

/**
 * Generate accessory image using Gemini
 */
async function generateAccessoryImage(
  description: string,
  type: AccessoryType,
): Promise<string> {
  try {
    console.log(`🎨 Generating ${type} image with Gemini...`);

    const prompt = `Create a high-quality product photo of a ${type} accessory with the following specifications:

${description}

REQUIREMENTS:
- Professional product photography style
- White or light neutral background
- Well-lit with soft shadows
- Clear, detailed view of the accessory
- No people or models in the image
- Focus on the accessory itself
- High resolution and sharp details

Return ONLY the image of the accessory.`;

    const response = await ai.models.generateContent({
      model,
      contents: [{ text: prompt }],
      config: {
        responseModalities: [Modality.IMAGE, Modality.TEXT],
      },
    });

    // Extract image from response
    for (const candidate of response.candidates ?? []) {
      const imagePart = candidate.content?.parts?.find(
        (part: any) => part.inlineData,
      );
      if (imagePart?.inlineData) {
        const mimeType = imagePart.inlineData.mimeType || "image/jpeg";
        const data = imagePart.inlineData.data;
        const dataUrl = `data:${mimeType};base64,${data}`;
        console.log(`✅ Generated ${type} image successfully`);
        return dataUrl;
      }
    }

    throw new Error("No image returned from Gemini API");
  } catch (error) {
    console.error(`❌ Error generating ${type} image:`, error);
    throw error;
  }
}

/**
 * Main function to generate accessories for an outfit
 */
export async function generateAccessoriesForOutfit(
  outfitId: number,
  userId: number,
): Promise<GeneratedAccessory[]> {
  try {
    console.log(`🚀 Starting accessory generation for outfit ${outfitId}`);

    // 1. Get outfit from database (using id)
    const outfit = await Outfit.findOne({ where: { id: outfitId } });

    if (!outfit) {
      throw new Error(`Outfit ${outfitId} not found`);
    }

    // Verify outfit belongs to user
    if (outfit.userId !== userId) {
      throw new Error(`Outfit ${outfitId} does not belong to user ${userId}`);
    }

    // 2. Check if accessories already exist for this outfit (using internal id)
    const existingAccessories = await Accessory.findAll({
      where: { outfitId: outfit.id },
    });

    if (existingAccessories.length > 0) {
      throw new Error(
        `Accessories already exist for outfit ${outfitId}. Cannot regenerate.`,
      );
    }

    // 3. Get outfit main image URL
    const imageUrl = outfit.primaryImageUrl;

    if (!imageUrl) {
      throw new Error(`No image available for outfit ${outfitId}`);
    }

    console.log(`�️  Using outfit image URL: ${imageUrl}`);

    // 4. Select 3 random accessory types
    const selectedTypes = selectRandomAccessories();
    console.log(`🎲 Selected accessory types: ${selectedTypes.join(", ")}`);

    // 5. Generate accessory descriptions using LangGraph (RAG + Vision)
    const result = await generateAccessoryDescriptions(imageUrl, selectedTypes);
    const descriptions = result.accessories;
    const accessoriesSummary = result.overallSummary;

    console.log(
      `📝 Accessories summary: ${accessoriesSummary.substring(0, 100)}...`,
    );

    // 6. Generate ONE image with ALL 3 accessories using Gemini
    console.log("🎨 Generating single image with all 3 accessories...");
    console.log(
      `📋 Accessory types: ${descriptions.map((d) => d.type).join(", ")}`,
    );
    console.log("📝 Descriptions:");
    descriptions.forEach((desc, idx) => {
      console.log(
        `   ${idx + 1}. ${desc.type}: ${desc.description.substring(0, 100)}...`,
      );
    });

    // Create combined prompt for all accessories
    const combinedPrompt = `Create a high-quality product photo showing THREE SEPARATE accessories arranged in a clear horizontal line:

LEFT POSITION (Item 1): ${descriptions[0].type.toUpperCase()}
${descriptions[0].description}

CENTER POSITION (Item 2): ${descriptions[1].type.toUpperCase()}
${descriptions[1].description}

RIGHT POSITION (Item 3): ${descriptions[2].type.toUpperCase()}
${descriptions[2].description}

CRITICAL LAYOUT REQUIREMENTS:
- Professional product photography style on white/light neutral background
- Arrange the three items in a STRAIGHT HORIZONTAL LINE from LEFT to RIGHT
- MAXIMUM SPACING: Leave at least 30% of the image width as empty space between each accessory
- Each accessory should occupy approximately 20-25% of the image width
- Items must NOT touch or overlap each other
- Clear visual separation between all three accessories
- Position Item 1 on the LEFT side, Item 2 in the CENTER, Item 3 on the RIGHT side
- Well-lit with soft shadows
- Clear, detailed view of each accessory
- No people or models in the image
- High resolution and sharp details

Return ONLY the image with all three accessories clearly separated in a horizontal line (left-center-right).`;

    let combinedImageDataUrl: string;
    try {
      const response = await ai.models.generateContent({
        model,
        contents: [{ text: combinedPrompt }],
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      });

      // Extract image from response
      let imageFound = false;
      for (const candidate of response.candidates ?? []) {
        const imagePart = candidate.content?.parts?.find(
          (part: any) => part.inlineData,
        );
        if (imagePart?.inlineData) {
          const mimeType = imagePart.inlineData.mimeType || "image/jpeg";
          const data = imagePart.inlineData.data;
          combinedImageDataUrl = `data:${mimeType};base64,${data}`;
          imageFound = true;
          console.log("✅ Generated combined accessories image successfully");

          // 🐛 DEBUG: Save the original single image from Gemini (BEFORE any processing)
          try {
            console.log(`🐛 Attempting to save original Gemini image...`);
            console.log(`🐛 Current working directory: ${process.cwd()}`);

            const fs = await import("fs/promises");
            const path = await import("path");
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const debugDir = path.join(
              process.cwd(),
              "generated-images",
              "debug-accessories",
            );
            const debugPath = path.join(
              debugDir,
              `ORIGINAL-gemini-single-image-outfit${outfitId}-${timestamp}.png`,
            );

            console.log(`🐛 Creating directory: ${debugDir}`);
            await fs.mkdir(debugDir, { recursive: true });

            console.log(`🐛 Writing file to: ${debugPath}`);
            const imageBuffer = Buffer.from(data, "base64");
            console.log(`🐛 Image buffer size: ${imageBuffer.length} bytes`);
            await fs.writeFile(debugPath, imageBuffer);

            // Verify file was written
            const stats = await fs.stat(debugPath);
            console.log(
              `\n🐛 ==================== DEBUG SAVE ====================`,
            );
            console.log(
              `🐛 ORIGINAL IMAGE FROM GEMINI (with all 3 accessories)`,
            );
            console.log(`🐛 Saved to: ${debugPath}`);
            console.log(`🐛 File size: ${stats.size} bytes`);
            console.log(
              `🐛 ====================================================\n`,
            );
          } catch (debugError: any) {
            console.error(
              `\n❌ ==================== DEBUG SAVE FAILED ====================`,
            );
            console.error(`❌ Error saving debug image:`, debugError);
            console.error(`❌ Error message: ${debugError.message}`);
            console.error(`❌ Error stack:`, debugError.stack);
            console.error(
              `❌ =============================================================\n`,
            );
          }

          break;
        }
      }

      if (!imageFound) {
        throw new Error("No image returned from Gemini API");
      }
    } catch (error) {
      console.error("❌ Error generating combined accessories image:", error);
      throw error;
    }

    // 7. Remove background from combined image
    console.log("🖼️  Removing background from combined image...");
    const processedImageDataUrl = await removeBackgroundFromBase64(
      combinedImageDataUrl,
      { background: "transparent" },
    );
    console.log("✅ Background removed successfully");

    // Convert to buffer for processing
    const base64Data =
      processedImageDataUrl.split(",")[1] || processedImageDataUrl;
    const combinedImageBuffer = Buffer.from(base64Data, "base64");

    // Save debug image after background removal
    if (SAVE_DEBUG_IMAGES) {
      try {
        console.log(`🐛 Attempting to save background-removed image...`);
        const fs = await import("fs/promises");
        const path = await import("path");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const debugDir = path.join(
          process.cwd(),
          "generated-images",
          "debug-accessories",
        );
        const debugPath = path.join(
          debugDir,
          `step2-bg-removed-${outfitId}-${timestamp}.png`,
        );

        await fs.mkdir(debugDir, { recursive: true });
        await fs.writeFile(debugPath, combinedImageBuffer);

        const stats = await fs.stat(debugPath);
        console.log(`🐛 Step 2 - Background removed image saved: ${debugPath}`);
        console.log(`🐛 File size: ${stats.size} bytes`);
      } catch (debugError: any) {
        console.error(
          `❌ Could not save background-removed image:`,
          debugError,
        );
        console.error(`❌ Error message: ${debugError.message}`);
      }
    }

    // 8. Extract individual objects from the combined image
    console.log("✂️  Extracting individual accessories from combined image...");
    const extractedObjects = await extractMultipleObjects(
      combinedImageBuffer,
      200, // Minimum 200 pixels for an object
      SAVE_DEBUG_IMAGES, // Save debug images (controlled by env var)
      `step3-outfit-${outfitId}`, // Debug prefix
    );

    if (extractedObjects.length === 0) {
      throw new Error("Failed to extract any accessories from combined image");
    }

    console.log(
      `📦 Successfully extracted ${extractedObjects.length} objects from image`,
    );

    // 9. Process each extracted object and save as individual accessory
    const generatedAccessories: GeneratedAccessory[] = [];

    for (
      let i = 0;
      i < Math.min(extractedObjects.length, descriptions.length);
      i++
    ) {
      try {
        const desc = descriptions[i];
        const objectBuffer = extractedObjects[i];

        // Create pending accessory record (using outfit's internal id)
        const accessory = await Accessory.create({
          outfitId: outfit.id,
          accessoryType: desc.type,
          description: desc.description,
          status: "pending",
        });

        console.log(
          `📝 Processing ${desc.type} accessory (ID: ${accessory.id})`,
        );

        // Apply centering and standardization to each extracted object
        console.log(`🎯 Centering and standardizing ${desc.type}...`);
        const centeredBuffer = await centerAndStandardizeImage(
          objectBuffer,
          512, // Smaller canvas for accessories
          512,
          false, // Don't save debug images for accessories (we'll save manually)
        );
        console.log(`✅ ${desc.type} centered successfully`);

        // Save debug image of centered accessory
        if (SAVE_DEBUG_IMAGES) {
          try {
            const fs = await import("fs/promises");
            const path = await import("path");
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const debugPath = path.join(
              process.cwd(),
              "generated-images",
              "debug-accessories",
              `step4-centered-${desc.type}-${outfitId}-${timestamp}.png`,
            );
            await fs.mkdir(path.dirname(debugPath), { recursive: true });
            await fs.writeFile(debugPath, centeredBuffer);
            console.log(`� Step 4 - Centered ${desc.type} saved: ${debugPath}`);
          } catch (debugError) {
            console.warn(`Could not save centered image:`, debugError);
          }
        }

        // Convert to base64 for upload
        const centeredBase64 = `data:image/png;base64,${centeredBuffer.toString(
          "base64",
        )}`;

        // Upload to GCS
        console.log(`☁️  Uploading ${desc.type} image to GCS...`);
        const fileName = `${desc.type}_${Date.now()}.png`;
        const folder = `accessories/${outfitId}`;
        const { httpUrl: publicUrl, gsUri: gsUtilUrl } =
          await uploadBase64Image(
            centeredBase64,
            fileName,
            userId.toString(),
            folder,
            "image/png",
          );

        // Update accessory record with image URLs
        await accessory.update({
          imageUrl: publicUrl,
          gsUtil: gsUtilUrl,
          status: "complete",
        });

        console.log(
          `✅ Completed ${desc.type} accessory (ID: ${accessory.id})`,
        );

        generatedAccessories.push({
          id: accessory.id,
          type: desc.type,
          description: desc.description,
          imageUrl: publicUrl,
          gsUtil: gsUtilUrl,
        });
      } catch (error) {
        console.error(`❌ Error processing accessory ${i + 1}:`, error);
        // Continue with other accessories even if one fails
      }
    }

    if (generatedAccessories.length === 0) {
      throw new Error("Failed to generate any accessories");
    }

    // Update outfit to mark that it has accessories and save the accessories summary
    const generatedAccessoryIds = generatedAccessories.map((acc) => acc.id);
    await outfit.update({
      hasAccessories: true,
      accessoryIds: generatedAccessoryIds,
      accessoriesSummary: accessoriesSummary,
    });
    console.log(`✅ Updated outfit ${outfitId} hasAccessories flag to true`);
    console.log(`✅ Saved accessories summary: ${accessoriesSummary}`);

    console.log(
      `🎉 Successfully generated ${generatedAccessories.length} accessories for outfit ${outfitId}`,
    );
    console.log("📊 Summary:");
    generatedAccessories.forEach((acc, idx) => {
      console.log(
        `   ${idx + 1}. ${acc.type} (ID: ${acc.id}) - ${acc.imageUrl}`,
      );
    });
    console.log(`� Debug images saved in: generated-images/debug-accessories/`);

    return generatedAccessories;
  } catch (error) {
    console.error(`❌ Error in generateAccessoriesForOutfit:`, error);
    throw error;
  }
}

/**
 * Get accessories for an outfit
 */
export async function getAccessoriesForOutfit(
  outfitId: number,
): Promise<Accessory[]> {
  console.log(`🔍 getAccessoriesForOutfit called with outfitId: ${outfitId}`);

  // First find the outfit by id to get its internal id
  const outfit = await Outfit.findOne({ where: { id: outfitId } });

  if (!outfit) {
    console.log(`❌ Outfit not found for outfitId: ${outfitId}`);
    return []; // Return empty array if outfit not found
  }

  console.log(`✅ Found outfit with internal id: ${outfit.id}`);

  const accessories = await Accessory.findAll({
    where: { outfitId: outfit.id },
    order: [["createdAt", "ASC"]],
  });

  console.log(
    `📦 Found ${accessories.length} accessories for outfit ${outfitId} (internal id: ${outfit.id})`,
  );

  return accessories;
}
