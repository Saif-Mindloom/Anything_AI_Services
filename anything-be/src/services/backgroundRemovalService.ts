import axios from "axios";

export interface BackgroundRemovalOptions {
  background?: "transparent" | "white" | "black";
}

// Configuration
const USE_BIREFNET = process.env.USE_BIREFNET !== "false"; // Default to true
const BIREFNET_SERVICE_URL =
  process.env.BIREFNET_SERVICE_URL || "http://localhost:8000";
const BIREFNET_TIMEOUT_MS = Number(process.env.BIREFNET_TIMEOUT_MS || 240000); // 4 minutes
const BIREFNET_MAX_INPUT_DIMENSION = Number(
  process.env.BIREFNET_MAX_INPUT_DIMENSION || 1536,
);
const BIREFNET_JPEG_QUALITY = Number(process.env.BIREFNET_JPEG_QUALITY || 82);
const REMOVEBG_API_KEY = process.env.REMOVEBG_API_KEY;
const REMOVEBG_API_URL = "https://api.remove.bg/v1.0/removebg";

// Log the configuration on startup
console.log(`🎨 Background Removal Service Configuration:`);
console.log(`   Using BiRefNet: ${USE_BIREFNET}`);
if (USE_BIREFNET) {
  console.log(`   BiRefNet URL: ${BIREFNET_SERVICE_URL}`);
} else {
  console.log(`   Using Remove.bg API`);
  if (!REMOVEBG_API_KEY) {
    console.warn(
      "⚠️  REMOVEBG_API_KEY environment variable is not set. Background removal will fail.",
    );
  }
}

/**
 * Remove background using BiRefNet service
 */
async function removeBackgroundBiRefNet(
  base64Image: string,
  options: BackgroundRemovalOptions = {},
): Promise<string> {
  try {
    const startTime = Date.now();

    // Extract base64 data (remove data:image/xxx;base64, prefix if present)
    const base64Data = base64Image.includes(",")
      ? base64Image.split(",")[1]
      : base64Image;

    const optimizedBase64Data = await optimizeImageForBiRefNet(base64Data);
    console.log(
      `🔄 Sending image to BiRefNet service (size: ${Math.round(
        optimizedBase64Data.length / 1024,
      )}KB, timeout: ${BIREFNET_TIMEOUT_MS}ms)`,
    );

    // Call BiRefNet service
    const response = await axios.post(
      `${BIREFNET_SERVICE_URL}/remove-background-base64`,
      {
        image_data: optimizedBase64Data,
      },
      {
        timeout: BIREFNET_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const elapsedTime = Date.now() - startTime;
    console.log(`✅ BiRefNet background removal completed in ${elapsedTime}ms`);

    // BiRefNet always returns transparent background
    // Apply background color if requested
    if (options.background && options.background !== "transparent") {
      return await applyBackgroundColor(
        response.data.image_data,
        options.background,
      );
    }

    return response.data.image_data;
  } catch (error: any) {
    console.error("❌ BiRefNet service error:", {
      message: error.message,
      code: error.code,
      response: error.response?.data,
    });

    // If BiRefNet fails and we have removebg API key, fallback to it
    if (REMOVEBG_API_KEY) {
      console.log("⚠️  Falling back to Remove.bg API");
      return removeBackgroundRemoveBg(base64Image, options);
    }

    throw new Error(`BiRefNet background removal failed: ${error.message}`);
  }
}

/**
 * Reduce image payload before sending to BiRefNet to avoid request timeouts.
 */
async function optimizeImageForBiRefNet(base64Data: string): Promise<string> {
  try {
    const sharp = require("sharp");
    const inputBuffer = Buffer.from(base64Data, "base64");
    const metadata = await sharp(inputBuffer).metadata();
    const width = metadata.width || BIREFNET_MAX_INPUT_DIMENSION;
    const height = metadata.height || BIREFNET_MAX_INPUT_DIMENSION;
    const largestEdge = Math.max(width, height);

    const pipeline = sharp(inputBuffer, { failOn: "none" }).rotate();
    if (largestEdge > BIREFNET_MAX_INPUT_DIMENSION) {
      pipeline.resize({
        width:
          width >= height ? BIREFNET_MAX_INPUT_DIMENSION : undefined,
        height:
          height > width ? BIREFNET_MAX_INPUT_DIMENSION : undefined,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const optimizedBuffer = await pipeline
      .jpeg({ quality: BIREFNET_JPEG_QUALITY, mozjpeg: true })
      .toBuffer();

    return optimizedBuffer.toString("base64");
  } catch (error) {
    // If optimization fails, continue with original payload.
    console.warn("⚠️ BiRefNet optimization failed; sending original image");
    return base64Data;
  }
}

/**
 * Remove background using Remove.bg API (legacy/fallback)
 */
async function removeBackgroundRemoveBg(
  base64Image: string,
  options: BackgroundRemovalOptions = {},
): Promise<string> {
  if (!REMOVEBG_API_KEY) {
    throw new Error(
      "REMOVEBG_API_KEY environment variable is required for Remove.bg service",
    );
  }

  try {
    const FormData = require("form-data");

    // Extract base64 data (remove data:image/xxx;base64, prefix if present)
    const base64Data = base64Image.includes(",")
      ? base64Image.split(",")[1]
      : base64Image;

    // Convert base64 to buffer for binary upload
    const imageBuffer = Buffer.from(base64Data, "base64");

    // Prepare form data for remove.bg API
    const formData = new FormData();
    formData.append("image_file", imageBuffer, {
      filename: "image.png",
      contentType: "image/png",
    });
    formData.append("size", "auto"); // Use highest available resolution

    // Add background color if specified
    if (options.background === "white") {
      formData.append("bg_color", "ffffff");
    } else if (options.background === "black") {
      formData.append("bg_color", "000000");
    }
    // For transparent, we don't need to add bg_color (default behavior)

    const response = await axios.post(REMOVEBG_API_URL, formData, {
      headers: {
        "X-API-Key": REMOVEBG_API_KEY,
        ...formData.getHeaders(),
      },
      responseType: "arraybuffer",
      timeout: 60000, // 60 seconds timeout for remove.bg API
    });

    // Convert the response buffer to base64
    const resultBase64 = Buffer.from(response.data).toString("base64");
    return `data:image/png;base64,${resultBase64}`;
  } catch (error: any) {
    if (error.response) {
      const errorMessage = error.response.data
        ? Buffer.from(error.response.data).toString()
        : error.message;
      console.error("Remove.bg API error:", {
        status: error.response.status,
        statusText: error.response.statusText,
        message: errorMessage,
      });
      throw new Error(
        `Background removal failed: ${error.response.status} - ${errorMessage}`,
      );
    }
    console.error("Background removal error:", error);
    throw new Error(`Background removal failed: ${error.message}`);
  }
}

/**
 * Apply background color to transparent image
 */
async function applyBackgroundColor(
  base64Image: string,
  color: "white" | "black",
): Promise<string> {
  const sharp = require("sharp");

  try {
    // Extract base64 data
    const base64Data = base64Image.includes(",")
      ? base64Image.split(",")[1]
      : base64Image;

    const imageBuffer = Buffer.from(base64Data, "base64");

    // Create background color
    const bgColor =
      color === "white" ? { r: 255, g: 255, b: 255 } : { r: 0, g: 0, b: 0 };

    // Apply background using sharp
    const result = await sharp(imageBuffer)
      .flatten({ background: bgColor })
      .png()
      .toBuffer();

    const resultBase64 = result.toString("base64");
    return `data:image/png;base64,${resultBase64}`;
  } catch (error: any) {
    console.error("Error applying background color:", error);
    // Return original image if processing fails
    return base64Image;
  }
}

/**
 * Main export: Remove background from base64 image
 */
export const removeBackgroundFromBase64 = async (
  base64Image: string,
  options: BackgroundRemovalOptions = {},
): Promise<string> => {
  if (USE_BIREFNET) {
    return removeBackgroundBiRefNet(base64Image, options);
  } else {
    return removeBackgroundRemoveBg(base64Image, options);
  }
};
