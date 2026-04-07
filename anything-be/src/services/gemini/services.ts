/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Modality } from "@google/genai";
import { promises as fsp } from "fs";

interface GeminiPart {
  inlineData?: {
    mimeType: string;
    data: string;
  };
  text?: string;
}

const bufferToPart = (
  buffer: Buffer,
  mimeType: string = "image/jpeg",
): GeminiPart => {
  const base64Data = buffer.toString("base64");
  return { inlineData: { mimeType, data: base64Data } };
};

const dataUrlToParts = (
  dataUrl: string,
): { mimeType: string; data: string } => {
  const arr = dataUrl.split(",");
  if (arr.length < 2) throw new Error("Invalid data URL");
  const mimeMatch = arr[0]?.match(/:(.*?);/);
  if (!mimeMatch || !mimeMatch[1])
    throw new Error("Could not parse MIME type from data URL");
  return { mimeType: mimeMatch[1], data: arr[1]! };
};

const dataUrlToPart = (dataUrl: string): GeminiPart => {
  const { mimeType, data } = dataUrlToParts(dataUrl);
  return { inlineData: { mimeType, data } };
};

const handleApiResponse = (response: any): string => {
  // Handle prompt feedback block
  if (response.promptFeedback?.blockReason) {
    const { blockReason, blockReasonMessage } = response.promptFeedback;
    const errorMessage = `Request was blocked. Reason: ${blockReason}. ${
      blockReasonMessage || ""
    }`;
    throw new Error(errorMessage);
  }

  // Find image part in candidates
  for (const candidate of response.candidates ?? []) {
    const imagePart = candidate.content?.parts?.find(
      (part: any) => part.inlineData,
    );
    if (imagePart?.inlineData) {
      // Some SDKs may have mimeType optional, so fallback to 'image/jpeg' if missing
      const mimeType = imagePart.inlineData.mimeType || "image/jpeg";
      const data = imagePart.inlineData.data;
      return `data:${mimeType};base64,${data}`;
    }
  }

  // Handle finish reason
  const finishReason = response.candidates?.[0]?.finishReason;
  if (finishReason && finishReason !== "STOP") {
    const errorMessage = `Image generation stopped unexpectedly. Reason: ${finishReason}. This often relates to safety settings.`;
    throw new Error(errorMessage);
  }

  // Handle text feedback
  const textFeedback = response.text?.trim();
  const errorMessage =
    `The AI model did not return an image. ` +
    (textFeedback
      ? `The model responded with text: "${textFeedback}"`
      : "This can happen due to safety filters or if the request is too complex. Please try a different image.");
  throw new Error(errorMessage);
};

const ai = new GoogleGenAI({
  apiKey: "AIzaSyD-dGOfFy8yS9l0LfgdK6rw8iSvudKHmik",
});
const model = "gemini-2.5-flash-image";

export const generateModelImage = async (
  userImageBuffer: Buffer,
  referenceImageBuffer: Buffer,
  mimeType: string = "image/jpeg",
  height?: number,
  weight?: number,
  gender?: string,
): Promise<string> => {
  const userImagePart = bufferToPart(userImageBuffer, mimeType);
  const referenceImagePart = bufferToPart(referenceImageBuffer, mimeType);
  const parts = [userImagePart, referenceImagePart];
  // const parts = [userImagePart];

  // Build the prompt with optional height, weight, and gender specifications
  let prompt2 =
    "You are an expert fashion photographer AI. Create a full-body fashion model photo suitable for an e-commerce website using both provided images as reference. Use both the first and second image to understand the person's features, body type, and styling. COMPLETELY REMOVE all original clothing from both reference images and dress the model in the following outfit: blue jeans, black t-shirt, and black shoes. The background must be a clean, neutral studio backdrop (light gray, #f0f0f0). The person should have a neutral, professional model expression and be placed in a standard, relaxed standing model pose with hands visible and positioned naturally at their sides - NOT in pockets.";
  // let prompt =
  //   "You are an expert fashion photographer AI. Create a full-body fashion model photo suitable for an e-commerce website using provided image as reference. Use the image to understand the person's features, body type, and styling. COMPLETELY REMOVE all original clothing from both reference images and dress the model in the following outfit: blue jeans, black t-shirt, and black shoes. The background must be a clean, neutral studio backdrop (light gray, #f0f0f0). The person should have a neutral, professional model expression and be placed in a standard, relaxed standing model pose with hands visible and positioned naturally at their sides - NOT in pockets.";

  let prompt = `You are an expert fashion photographer AI.

You are given TWO reference images:
- IMAGE 1: Use ONLY the FACE, facial structure, skin tone, and identity of the person from this image.
- IMAGE 2: Use ONLY the BODY, height, proportions, posture, and physique from this image.

CRITICAL INSTRUCTIONS:
- The FINAL PERSON must have the FACE from IMAGE 1 and the BODY from IMAGE 2.
- Do NOT mix facial features from IMAGE 2.
- Do NOT use body shape, posture, or proportions from IMAGE 1.
- Preserve face likeness from IMAGE 1 as accurately as possible.

COMPLETELY REMOVE all original clothing from BOTH reference images.

Dress the final model in:
- Blue jeans
- Black t-shirt
- Black shoes

POSE & COMPOSITION:
- Full-body shot (head to toe fully visible)
- Relaxed, neutral standing model pose
- Hands visible and positioned naturally at the sides (NOT in pockets)
- Neutral, professional e-commerce model expression

BACKGROUND & STYLE:
- Clean studio background, light gray (#f0f0f0)
- High-quality, photorealistic, e-commerce fashion photography
- Proper lighting, realistic shadows, sharp focus

The output must look like a real studio fashion model photo.
Return ONLY the final generated image.`;

  // Add physical specifications if provided
  if (height || weight || gender) {
    prompt += " Consider the following physical specifications:";
    if (height) {
      prompt += ` Height: ${height} cm.`;
    }
    if (weight) {
      prompt += ` Weight: ${weight} kg.`;
    }
    if (gender) {
      if (gender.toLowerCase() === "male") {
        prompt += " Gender: Male";
      } else if (gender.toLowerCase() === "female") {
        prompt += " Gender: Female";
      } else {
        prompt += " Gender: prefer not to say";
      }
    }
  }

  // prompt +=
  //   " The final image must be photorealistic and show a full-body view with the model's head to feet visible. CRITICAL: The model must wear ONLY blue jeans, a black t-shirt, and black shoes - do not retain any clothing from the original images. Return ONLY the final image.";

  parts.push({ text: prompt });
  console.log("Generating model image with prompt:", prompt);

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  return handleApiResponse(response);
};

export const generateVirtualTryOnImageLocal = async (
  modelImagePath: string,
  garmentImagePath: string,
  mimeType: string = "image/jpeg",
): Promise<string> => {
  const modelImageBuffer = await fsp.readFile(modelImagePath);
  const garmentImageBuffer = await fsp.readFile(garmentImagePath);

  const modelImagePart = bufferToPart(modelImageBuffer, mimeType);
  const garmentImagePart = bufferToPart(garmentImageBuffer, mimeType);

  const prompt = `You are an expert virtual try-on AI. You will be given a 'model image' and a 'garment image'. Your task is to create a new photorealistic image where the person from the 'model image' is wearing the clothing from the 'garment image'.
  
  **Crucial Rules:**
  1.  **Complete Garment Replacement:** You MUST completely REMOVE and REPLACE the clothing item worn by the person in the 'model image' with the new garment. No part of the original clothing (e.g., collars, sleeves, patterns) should be visible in the final image.
  2.  **Preserve the Model:** The person's face, hair, body shape, and pose from the 'model image' MUST remain unchanged.
  3.  **Preserve the Background:** The entire background from the 'model image' MUST be preserved perfectly.
  4.  **Apply the Garment:** Realistically fit the new garment onto the person. It should adapt to their pose with natural folds, shadows, and lighting consistent with the original scene.
  5.  **Output:** Return ONLY the final, edited image. Do not include any text.`;

  const response = await ai.models.generateContent({
    model,
    contents: [modelImagePart, garmentImagePart, { text: prompt }],
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  return handleApiResponse(response);
};

/**
 * Generate multiple angle views from a model image
 * NOTE: This function is now deprecated. Use the angleGenerationQueue instead for better performance and reliability.
 * @deprecated Use angleGenerationQueue from src/queues/angleGenerationQueue.ts
 */
export const generateModelAngles = async (
  modelImageUrl: string,
  skipAngles: string[] = [],
): Promise<{ [key: string]: string }> => {
  // Download model image and convert to base64
  const downloadImageAsBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString("base64");
  };

  const modelImageBase64 = await downloadImageAsBase64(modelImageUrl);

  // Define the angle descriptions and corresponding prompts
  const angles = {
    "0": {
      name: "0 degrees",
      prompt:
        "Generate a view where the person's body is facing completely to the right (profile view from the left side). The person should be positioned so their left side is visible to the camera, facing 90 degrees to the right from the original front-facing position.",
    },
    "45": {
      name: "45 degrees",
      prompt:
        "Generate a view where the person's body is angled 45 degrees to the right from center. This is a three-quarter view where the person is partially turned to the right, showing both front and right side of their body.",
    },
    "90": {
      name: "90 degrees",
      prompt:
        "Generate a view where the person's body is facing directly forward toward the camera. This is the standard front-facing pose, centered and straight-on.",
    },
    "135": {
      name: "135 degrees",
      prompt:
        "Generate a view where the person's body is angled 45 degrees to the left from center. This is a three-quarter view where the person is partially turned to the left, showing both front and left side of their body.",
    },
    "180": {
      name: "180 degrees",
      prompt:
        "Generate a view where the person's body is facing completely to the left (profile view from the right side). The person should be positioned so their right side is visible to the camera, facing 90 degrees to the left from the original front-facing position.",
    },
  };

  const results: { [key: string]: string } = {};

  // Helper function for exponential backoff retry
  const generateWithRetry = async (
    degree: string,
    config: { name: string; prompt: string },
    maxRetries = 5,
  ): Promise<string> => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `Generating ${config.name} view (attempt ${attempt}/${maxRetries})...`,
        );

        const fullPrompt = `You are an expert fashion photographer AI. Transform this model image to show the person from a different angle while maintaining all other aspects identical.

**CRITICAL REQUIREMENTS:**
1. **Preserve Identity:** The person's face, hair, body shape, and physical features MUST remain exactly the same
2. **Preserve Clothing:** All clothing items, colors, patterns, and styling MUST remain identical
3. **Preserve Background:** The background, lighting, and overall scene MUST remain the same
4. **Change Only Angle:** ${config.prompt}
5. **Maintain Quality:** Keep the same photorealistic quality and resolution
6. **Natural Pose:** Ensure the new angle looks natural and professionally photographed

${config.prompt}

Return ONLY the final image with the new angle.`;

        // Use API-based Gemini call with base64 image
        const response = await ai.models.generateContent({
          model,
          contents: [
            { text: fullPrompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: modelImageBase64,
              },
            },
          ],
          config: {
            responseModalities: [Modality.IMAGE, Modality.TEXT],
          },
        });

        const result = handleApiResponse(response);
        console.log(`Generated ${config.name} view successfully`);
        return result;
      } catch (error: any) {
        const isRateLimitError =
          error?.message?.includes("429") ||
          error?.message?.includes("RESOURCE_EXHAUSTED");

        if (isRateLimitError && attempt < maxRetries) {
          // Exponential backoff: 10s, 20s, 40s
          const delayMs = 10000 * Math.pow(2, attempt - 1);
          console.log(
            `Rate limit hit for ${config.name}. Retrying in ${
              delayMs / 1000
            }s...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          console.error(`Error generating ${config.name} view:`, error);
          if (attempt === maxRetries) {
            return "";
          }
        }
      }
    }
    return "";
  };

  // Generate each angle sequentially with longer delays to avoid rate limits
  for (const [degree, config] of Object.entries(angles)) {
    // Skip angles that are in the skipAngles array
    if (skipAngles.includes(degree)) {
      console.log(`Skipping ${config.name} view (using default image)...`);
      continue;
    }

    results[degree] = await generateWithRetry(degree, config);

    // Add a longer delay between requests (3 seconds) to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return results;
};
