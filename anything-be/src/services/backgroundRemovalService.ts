import axios from "axios";

export interface BackgroundRemovalOptions {
  background?: "transparent" | "white" | "black";
}

// Configuration
const USE_BIREFNET = process.env.USE_BIREFNET !== "false"; // Default to true
const BIREFNET_SERVICE_URL =
  process.env.BIREFNET_SERVICE_URL || "http://localhost:8000";
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

    console.log(
      `🔄 Sending image to BiRefNet service (size: ${Math.round(
        base64Data.length / 1024,
      )}KB)`,
    );

    // Call BiRefNet service
    const response = await axios.post(
      `${BIREFNET_SERVICE_URL}/remove-background-base64`,
      {
        image_data: base64Data,
      },
      {
        timeout: 120000, // 2 minutes timeout
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
