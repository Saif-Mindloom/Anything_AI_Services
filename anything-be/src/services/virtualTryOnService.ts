import { getUserFromToken } from "../helpers/utils";
import { Outfit } from "../models/outfit.model";
import {
  addVirtualTryOnJob,
} from "../queues/virtualTryOnQueue";

interface VirtualTryOnArgs {
  topId?: number;
  bottomId?: number;
  shoesId?: number;
  dressId?: number;
  outerwearId?: number;
  // Sequential mode (backward compatible)
  apparelGSURL?: string;
  // Batch mode (for shuffle feature)
  topGSURL?: string;
  bottomGSURL?: string;
  shoesGSURL?: string;
  dressGSURL?: string;
  outerwearGSURL?: string;
  accessory1Url?: string;
  accessory1Category?: string;
  accessory1Description?: string;
  accessory2Url?: string;
  accessory2Category?: string;
  accessory2Description?: string;
  accessory3Url?: string;
  accessory3Category?: string;
  accessory3Description?: string;
  baseModel: boolean;
  newModelGsUrl?: string;
}

interface VirtualTryOnResponse {
  success: boolean;
  message: string;
  savedFileName?: string;
  downloadUrl?: string;
  gsUri?: string;
  /** Present when a job was queued; null when outfit was served from DB cache (no polling). */
  jobId?: string | null;
  status?: string;
  outfitId?: number;
}

/**
 * Virtual Try-On mutation using queue system
 */
export const virtualTryOnMutation = async (
  _: any,
  args: VirtualTryOnArgs,
  context: any,
): Promise<VirtualTryOnResponse> => {
  try {
    const {
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
    } = args;

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
    ].filter((item) => !!item.url || !!item.category || !!item.description);

    for (const [index, item] of accessoryItems.entries()) {
      if (!item.url || !item.category) {
        return {
          success: false,
          message: `Invalid accessory input at position ${index + 1}. Both url and category are required when providing accessory data.`,
        };
      }
    }

    const hasAccessoryInputs = accessoryItems.length > 0;

    // Detect which mode we're in
    const hasSpecificURLs = !!(
      topGSURL ||
      bottomGSURL ||
      shoesGSURL ||
      dressGSURL ||
      outerwearGSURL
    );
    const hasGenericURL = !!apparelGSURL;

    // Validate mode usage
    if (hasSpecificURLs && hasGenericURL) {
      return {
        success: false,
        message:
          "Invalid input: Use either apparelGSURL (sequential mode) OR specific URLs (batch mode), not both.",
      };
    }

    if (!hasSpecificURLs && !hasGenericURL && !hasAccessoryInputs) {
      return {
        success: false,
        message:
          "Invalid input: Must provide either apparelGSURL or at least one specific item URL (topGSURL, bottomGSURL, shoesGSURL, dressGSURL, outerwearGSURL), or at least one accessory (url + category).",
      };
    }

    const isBatchMode = hasSpecificURLs;
    console.log(`🎯 Mode: ${isBatchMode ? "BATCH" : "SEQUENTIAL"}`);

    // Authentication check
    const authHeader = context.req?.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        success: false,
        message: "Authentication required. Please provide a valid token.",
      };
    }

    const token = authHeader.substring(7);
    const userFromToken = await getUserFromToken(token);

    if (!userFromToken) {
      return {
        success: false,
        message: "Invalid or expired token",
      };
    }

    // Calculate outfit ID
    const receivedTopId = topId ?? 0;
    const receivedBottomId = bottomId ?? 0;
    const receivedShoesId = shoesId ?? 0;
    const receivedDressId = dressId ?? 0;
    const receivedOuterwearId = outerwearId ?? 0;

    console.log(`🎬 Virtual try-on request for outfit composition`);
    console.log(
      `   Configuration: Top=${receivedTopId}, Bottom=${receivedBottomId}, Shoes=${receivedShoesId}, Dress=${receivedDressId}`,
    );
    console.log(`   Apparel URL: ${apparelGSURL}`);
    console.log(`   Base model: ${baseModel}`);
    if (newModelGsUrl) {
      console.log(`   New model URL: ${newModelGsUrl}`);
    }
    if (hasAccessoryInputs) {
      console.log(`   👜 Accessories requested: ${accessoryItems.length}`);
      accessoryItems.forEach((item, index) => {
        console.log(
          `      #${index + 1}: ${item.category} -> ${item.url} (${item.description || "no description"})`,
        );
      });
    }

    // Warn about potential garment mismatch
    const selectedGarments = [];
    if (receivedTopId > 0) selectedGarments.push("Top");
    if (receivedBottomId > 0) selectedGarments.push("Bottom");
    if (receivedShoesId > 0) selectedGarments.push("Shoes");
    if (receivedDressId > 0) selectedGarments.push("Dress");

    if (selectedGarments.length === 0) {
      console.warn(
        "   ⚠️  WARNING: No garment IDs provided (all are 0). This will create an outfit with no clothing items.",
      );
    } else {
      console.log(
        `   📦 Expected garment types: ${selectedGarments.join(", ")}`,
      );
    }

    // Validate apparelGSURL contains some indication of garment type (best effort)
    if (apparelGSURL) {
      const urlLower = apparelGSURL.toLowerCase();
      const detectedTypes = [];
      if (
        urlLower.includes("top") ||
        urlLower.includes("shirt") ||
        urlLower.includes("jacket")
      ) {
        detectedTypes.push("Top");
      }
      if (
        urlLower.includes("bottom") ||
        urlLower.includes("pants") ||
        urlLower.includes("jeans") ||
        urlLower.includes("trousers")
      ) {
        detectedTypes.push("Bottom");
      }
      if (urlLower.includes("shoe") || urlLower.includes("footwear")) {
        detectedTypes.push("Shoes");
      }
      if (urlLower.includes("dress")) {
        detectedTypes.push("Dress");
      }

      if (detectedTypes.length > 0) {
        console.log(
          `   🔍 Garment URL appears to be: ${detectedTypes.join(", ")}`,
        );

        // Check for obvious mismatch
        if (selectedGarments.length > 0 && detectedTypes.length > 0) {
          const mismatch = detectedTypes.some(
            (type) => !selectedGarments.includes(type),
          );
          if (mismatch) {
            console.warn(
              `   ⚠️  POTENTIAL MISMATCH: URL suggests ${detectedTypes.join(
                ", ",
              )} but selected garments are ${selectedGarments.join(", ")}`,
            );
            console.warn(
              "   ⚠️  This may cause incorrect results. Please verify the frontend is sending the correct garment URL.",
            );
          }
        }
      }
    }

    // Validate that all URLs are HTTP URLs, not GCS URIs
    const urlsToValidate = [
      { url: apparelGSURL, name: "apparelGSURL" },
      { url: topGSURL, name: "topGSURL" },
      { url: bottomGSURL, name: "bottomGSURL" },
      { url: shoesGSURL, name: "shoesGSURL" },
      { url: dressGSURL, name: "dressGSURL" },
      { url: outerwearGSURL, name: "outerwearGSURL" },
      { url: accessory1Url, name: "accessory1Url" },
      { url: accessory2Url, name: "accessory2Url" },
      { url: accessory3Url, name: "accessory3Url" },
    ];

    for (const { url, name } of urlsToValidate) {
      if (url && url.startsWith("gs://")) {
        return {
          success: false,
          message: `Please provide an HTTP URL for ${name}, not a GCS URI. Use urlProcessed field from apparel.`,
        };
      }
    }

    // Validate that newModelGsUrl is an HTTP URL if provided
    if (newModelGsUrl && newModelGsUrl.startsWith("gs://")) {
      return {
        success: false,
        message:
          "Please provide an HTTP URL for the model image, not a GCS URI.",
      };
    }

    // Check cache only for non-accessory requests.
    // Accessory combinations are intentionally excluded from resolver cache lookup.
    if (!hasAccessoryInputs) {
      const existingOutfit = await Outfit.findOne({
        where: {
          userId: userFromToken.userId,
          topId: receivedTopId,
          bottomId: receivedBottomId,
          shoeId: receivedShoesId,
          dressId: receivedDressId,
          outerwearId: receivedOuterwearId,
        },
      });

      if (existingOutfit) {
        console.log(`✅ Outfit found in cache (ID: ${existingOutfit.id})`);
        return {
          success: true,
          message: "Outfit already exists in cache",
          savedFileName: `${existingOutfit.id}.png`,
          downloadUrl: existingOutfit.primaryImageUrl || undefined,
          gsUri: existingOutfit.gsUtil || undefined,
          outfitId: existingOutfit.id,
          jobId: null,
          status: "completed",
        };
      }
    } else {
      console.log(
        "👜 Accessory request detected: skipping outfit cache lookup",
      );
    }

    // Queue the job
    console.log(`📋 Queueing virtual try-on job...`);
    const jobId = await addVirtualTryOnJob({
      userId: userFromToken.userId,
      topId: receivedTopId,
      bottomId: receivedBottomId,
      shoesId: receivedShoesId,
      dressId: receivedDressId,
      outerwearId: receivedOuterwearId,
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
    });

    console.log(`✅ Virtual try-on job queued with ID: ${jobId}`);
    return {
      success: true,
      message: "Virtual try-on job queued successfully",
      jobId: jobId as string,
      status: "queued",
    };
  } catch (err: any) {
    console.error("❌ Virtual try-on error:", err);
    return {
      success: false,
      message: `Virtual try-on failed: ${err.message}`,
    };
  }
};
