import { Apparel } from "../models/apparel.model";
import { CroppedImage } from "./clothingDetectionCropService";
import { IdUrlPair } from "./home/home";
import { generateApparelDescription } from "./openai/apparelDescriptionService";
import { Op } from "sequelize";
import { authenticateUser } from "./helper/auth";

/**
 * Helper function to format colors for GraphQL response
 * Handles both old format (array of colors) and new format (single color object)
 * @param colors - The colors field from database (can be array, object, or null)
 * @returns Array of color objects in the format expected by GraphQL
 */
const formatColorsForGraphQL = (
  colors: any,
): Array<{ colorname: string; colorvalue: string }> => {
  if (!colors) {
    return [{ colorname: "Unknown", colorvalue: "#000000" }];
  }

  if (Array.isArray(colors)) {
    // Handle old format: array of colors
    const validColors = colors
      .filter((color: any) => color && typeof color === "object")
      .map((color: any) => ({
        colorname: color.colorname || "Unknown",
        colorvalue: color.colorvalue || "#000000",
      }))
      .filter((color: any) => color.colorname && color.colorvalue);

    return validColors.length > 0
      ? validColors
      : [{ colorname: "Unknown", colorvalue: "#000000" }];
  }

  if (typeof colors === "object") {
    // Handle new format: single color object
    if (colors.colorname && colors.colorvalue) {
      return [
        {
          colorname: colors.colorname,
          colorvalue: colors.colorvalue,
        },
      ];
    }
  }

  // Fallback for any other unexpected format
  return [{ colorname: "Unknown", colorvalue: "#000000" }];
};

/**
 * Helper function to extract primary color name from colors data
 * Handles both old format (array) and new format (single object)
 * @param colors - The colors field from database
 * @returns The primary color name or undefined
 */
const getPrimaryColorName = (colors: any): string | undefined => {
  if (!colors) {
    return undefined;
  }

  if (Array.isArray(colors) && colors.length > 0) {
    return colors[0].colorname;
  }

  if (typeof colors === "object" && colors.colorname) {
    return colors.colorname;
  }

  return undefined;
};

/**
 * Check if a concept name is an accessory that should be skipped
 * This is used EARLY in the pipeline to avoid wasting resources on items we won't save
 * @param conceptName - The clothing concept name from detection
 * @returns true if the item is an accessory and should be skipped
 */
export const isAccessoryItem = (conceptName: string): boolean => {
  const lowerConcept = conceptName.toLowerCase();

  // List of valid categories that should be processed
  const validCategories = [
    // Tops
    "shirt",
    "blouse",
    "t-shirt",
    "tshirt",
    "tank",
    "top",
    "sweater",
    "cardigan",
    // Bottoms
    "jean",
    "pants",
    "short",
    "skirt",
    "trouser",
    "legging",
    // Shoes
    "shoe",
    "sneaker",
    "heel",
    "boot",
    "sandal",
    "slipper",
    // Outerwear
    "jacket",
    "coat",
    "blazer",
    "outerwear",
    // Dresses
    "dress",
    "gown",
  ];

  // Check if the concept matches any valid category
  const isValid = validCategories.some((category) =>
    lowerConcept.includes(category),
  );

  // If it doesn't match any valid category, it's an accessory
  return !isValid;
};

// Map clothing concept names to categories and subcategories
export interface ClothingMapping {
  category: "top" | "bottom" | "shoe" | "accessory" | "outerwear";
  subcategory:
    | "tshirt"
    | "shirt"
    | "jeans"
    | "shorts"
    | "sneakers"
    | "heels"
    | "jacket"
    | "coat"
    | "other";
}

export const mapConceptToClothingType = (
  conceptName: string,
): ClothingMapping => {
  const concept = conceptName.toLowerCase();

  // Top category mappings
  if (concept.includes("shirt") || concept.includes("blouse")) {
    return { category: "top", subcategory: "shirt" };
  }
  if (
    concept.includes("t-shirt") ||
    concept.includes("tee") ||
    concept.includes("tank")
  ) {
    return { category: "top", subcategory: "tshirt" };
  }

  // Bottom category mappings
  if (concept.includes("jean") || concept.includes("denim")) {
    return { category: "bottom", subcategory: "jeans" };
  }
  if (
    concept.includes("short") ||
    concept.includes("pants") ||
    concept.includes("trouser")
  ) {
    return { category: "bottom", subcategory: "shorts" };
  }

  // Shoe category mappings
  if (
    concept.includes("sneaker") ||
    concept.includes("trainer") ||
    concept.includes("athletic")
  ) {
    return { category: "shoe", subcategory: "sneakers" };
  }
  if (
    concept.includes("heel") ||
    concept.includes("pump") ||
    concept.includes("stiletto")
  ) {
    return { category: "shoe", subcategory: "heels" };
  }

  // Outerwear category mappings
  if (concept.includes("jacket") || concept.includes("blazer")) {
    return { category: "outerwear", subcategory: "jacket" };
  }
  if (concept.includes("coat") || concept.includes("overcoat")) {
    return { category: "outerwear", subcategory: "coat" };
  }

  // Default to top/other for unrecognized items
  return { category: "top", subcategory: "other" };
};

export const getDefaultBrand = (): string => "Unknown Brand";

export const getDefaultMaterial = ():
  | "Cotton"
  | "Linen"
  | "Denim"
  | "Polyester"
  | "Nylon"
  | "Silk"
  | "Wool"
  | "Rayon" => {
  return "Cotton"; // Default material
};

export const getDefaultName = (
  category: string,
  subcategory: string,
  color?: string,
): string => {
  const colorPrefix = color && color !== "Unknown" ? `${color} ` : "";

  // Generate name based on category and subcategory
  const categoryMap: { [key: string]: { [key: string]: string } } = {
    top: {
      tshirt: "T-Shirt",
      shirt: "Shirt",
      other: "Top",
    },
    bottom: {
      jeans: "Jeans",
      shorts: "Shorts",
      other: "Bottom",
    },
    shoe: {
      sneakers: "Sneakers",
      heels: "Heels",
      other: "Shoes",
    },
    accessory: {
      other: "Accessory",
    },
    outerwear: {
      jacket: "Jacket",
      coat: "Coat",
      other: "Outerwear",
    },
    dress: {
      other: "Dress",
    },
  };

  const name =
    categoryMap[category]?.[subcategory] ||
    categoryMap[category]?.other ||
    "Apparel Item";
  return `${colorPrefix}${name}`;
};

export const parseColorsToArray = (colorString: string): string[] => {
  if (!colorString) return ["Unknown"];

  // Split by common separators and clean up
  const colors = colorString
    .split(/\s+with\s+|\s+and\s+|,\s*|\s*&\s*/)
    .map((color) => color.trim())
    .filter((color) => color.length > 0);

  return colors.length > 0 ? colors : ["Unknown"];
};

/**
 * Calculate bounding box area from normalized coordinates
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

export const createApparelFromCroppedItem = async (
  croppedItem: CroppedImage,
  userId: number,
  isolatedImageUrl?: string,
  isolatedImageGsUri?: string,
  originalUploadedImageUrl?: string,
): Promise<Apparel | null> => {
  try {
    // Keep the original concept name instead of converting categories
    const conceptName = croppedItem.conceptName;

    // Use a simple category mapping that preserves more of the original information
    let category:
      | "top"
      | "bottom"
      | "shoe"
      | "accessory"
      | "outerwear"
      | "dress" = "accessory";
    let subcategory: string = "other";

    const lowerConcept = conceptName.toLowerCase();

    // Check for dress first (takes priority)
    if (lowerConcept.includes("dress")) {
      category = "dress";
    } else if (
      lowerConcept.includes("shirt") ||
      lowerConcept.includes("blouse") ||
      lowerConcept.includes("t-shirt") ||
      lowerConcept.includes("tank") ||
      lowerConcept.includes("top") ||
      lowerConcept.includes("sweater") ||
      lowerConcept.includes("cardigan")
    ) {
      category = "top";
    } else if (
      lowerConcept.includes("jean") ||
      lowerConcept.includes("pants") ||
      lowerConcept.includes("short") ||
      lowerConcept.includes("skirt") ||
      lowerConcept.includes("trouser")
    ) {
      category = "bottom";
    } else if (
      lowerConcept.includes("shoe") ||
      lowerConcept.includes("sneaker") ||
      lowerConcept.includes("heel") ||
      lowerConcept.includes("boot")
    ) {
      category = "shoe";
    } else if (
      lowerConcept.includes("jacket") ||
      lowerConcept.includes("coat") ||
      lowerConcept.includes("blazer") ||
      lowerConcept.includes("outerwear")
    ) {
      category = "top"; // Outerwear is treated as top
    }

    // Skip accessories - return null to filter them out
    if (category === "accessory") {
      console.log(`⏭️  Skipping accessory item: ${conceptName}`);
      return null;
    }

    // Generate AI-powered description and extract color using OpenAI
    let aiDescription = conceptName; // Fallback to concept name
    let colors = { colorname: "Unknown", colorvalue: "#808080" }; // Default fallback
    let generatedName = getDefaultName(category, subcategory as any, "Unknown"); // Fallback name

    try {
      console.log("🤖 Generating AI description for apparel...");
      const aiResult = await generateApparelDescription(
        isolatedImageUrl || croppedItem.croppedImageUrl,
      );
      aiDescription = aiResult.description;
      colors = {
        colorname: aiResult.color.name,
        colorvalue: aiResult.color.hex,
      };
      generatedName = aiResult.name; // Use LLM-generated name
      console.log(`✨ AI-generated name: "${generatedName}"`);
      console.log(`✨ AI-generated description: "${aiDescription}"`);
      console.log(
        `🎨 AI-detected color: ${colors.colorname} (${colors.colorvalue})`,
      );
    } catch (error) {
      console.warn(
        "⚠️  Failed to generate AI description, using fallback:",
        error,
      );
    }

    const apparelData = {
      userId,
      category: category,
      subcategory: subcategory as any,
      brand: getDefaultBrand(),
      name: generatedName, // Save the generated name
      status: "complete" as const,
      description: aiDescription, // Store AI-generated description instead of concept name
      material: getDefaultMaterial(),
      colors: colors,
      favorite: false,
      urlRaw: croppedItem.croppedImageUrl,
      urlProcessed: isolatedImageUrl || croppedItem.croppedImageUrl, // Use isolated image if available, otherwise cropped image
      originalUploadedImageUrl: originalUploadedImageUrl, // Store the original uploaded image URL
    };

    const newApparel = await Apparel.create(apparelData);
    console.log(`✅ Created apparel item: ${newApparel.id} for user ${userId}`);
    return newApparel;
  } catch (error) {
    console.error(`❌ Error creating apparel from cropped item:`, error);
    return null;
  }
};

/**
 * Prepare apparel data WITHOUT saving to database
 * Returns prepared data that can be used for deduplication logic before DB creation
 */
const prepareApparelDataFromCroppedItem = async (
  croppedItem: CroppedImage,
  userId: number,
  isolatedImageUrl?: string,
  isolatedImageGsUri?: string,
  originalUploadedImageUrl?: string,
): Promise<{
  apparelData: any;
  category: string;
  conceptName: string;
  boundingBox: any;
  confidence: number;
  regionId: number;
} | null> => {
  try {
    const conceptName = croppedItem.conceptName;

    // Determine category
    let category:
      | "top"
      | "bottom"
      | "shoe"
      | "accessory"
      | "outerwear"
      | "dress" = "accessory";
    let subcategory: string = "other";
    const lowerConcept = conceptName.toLowerCase();

    if (lowerConcept.includes("dress")) {
      category = "dress";
    } else if (
      lowerConcept.includes("shirt") ||
      lowerConcept.includes("blouse") ||
      lowerConcept.includes("t-shirt") ||
      lowerConcept.includes("tank") ||
      lowerConcept.includes("top") ||
      lowerConcept.includes("sweater") ||
      lowerConcept.includes("cardigan")
    ) {
      category = "top";
    } else if (
      lowerConcept.includes("jean") ||
      lowerConcept.includes("pants") ||
      lowerConcept.includes("short") ||
      lowerConcept.includes("skirt") ||
      lowerConcept.includes("trouser")
    ) {
      category = "bottom";
    } else if (
      lowerConcept.includes("shoe") ||
      lowerConcept.includes("sneaker") ||
      lowerConcept.includes("heel") ||
      lowerConcept.includes("boot")
    ) {
      category = "shoe";
    } else if (
      lowerConcept.includes("jacket") ||
      lowerConcept.includes("coat") ||
      lowerConcept.includes("blazer") ||
      lowerConcept.includes("outerwear")
    ) {
      category = "top";
    }

    // Skip accessories
    if (category === "accessory") {
      console.log(`⏭️  Skipping accessory item: ${conceptName}`);
      return null;
    }

    // Generate AI-powered description and extract color
    let aiDescription = conceptName;
    let colors = { colorname: "Unknown", colorvalue: "#808080" };
    let generatedName = getDefaultName(category, subcategory as any, "Unknown"); // Fallback name

    try {
      const aiResult = await generateApparelDescription(
        isolatedImageUrl || croppedItem.croppedImageUrl,
      );
      aiDescription = aiResult.description;
      colors = {
        colorname: aiResult.color.name,
        colorvalue: aiResult.color.hex,
      };
      generatedName = aiResult.name; // Use LLM-generated name
    } catch (error) {
      console.warn(
        "⚠️  Failed to generate AI description, using fallback:",
        error,
      );
    }

    const apparelData = {
      userId,
      category: category,
      subcategory: subcategory as any,
      brand: getDefaultBrand(),
      name: generatedName,
      status: "complete" as const,
      description: aiDescription,
      material: getDefaultMaterial(),
      colors: colors,
      favorite: false,
      urlRaw: croppedItem.croppedImageUrl,
      urlProcessed: isolatedImageUrl || croppedItem.croppedImageUrl,
      originalUploadedImageUrl: originalUploadedImageUrl,
    };

    return {
      apparelData,
      category,
      conceptName,
      boundingBox: croppedItem.boundingBox,
      confidence: croppedItem.confidence,
      regionId: croppedItem.regionId,
    };
  } catch (error) {
    console.error(`❌ Error preparing apparel data:`, error);
    return null;
  }
};

/**
 * Variant of prepareApparelDataFromCroppedItem that stores outerwear items
 * with category="outerwear" instead of collapsing them into "top".
 * Swap this in place of prepareApparelDataFromCroppedItem in
 * bulkCreateApparelsFromCroppedItems to enable the outerwear flow.
 */
const prepareApparelDataFromCroppedItemWithOuterwear = async (
  croppedItem: CroppedImage,
  userId: number,
  isolatedImageUrl?: string,
  isolatedImageGsUri?: string,
  originalUploadedImageUrl?: string,
): Promise<{
  apparelData: any;
  category: string;
  conceptName: string;
  boundingBox: any;
  confidence: number;
  regionId: number;
} | null> => {
  try {
    const conceptName = croppedItem.conceptName;

    let category:
      | "top"
      | "bottom"
      | "shoe"
      | "accessory"
      | "outerwear"
      | "dress" = "accessory";
    let subcategory: string = "other";
    const lowerConcept = conceptName.toLowerCase();

    if (lowerConcept.includes("dress")) {
      category = "dress";
    } else if (
      lowerConcept.includes("jacket") ||
      lowerConcept.includes("coat") ||
      lowerConcept.includes("blazer") ||
      lowerConcept === "outerwear" ||
      lowerConcept.includes("outerwear")
    ) {
      category = "outerwear";
    } else if (
      lowerConcept.includes("shirt") ||
      lowerConcept.includes("blouse") ||
      lowerConcept.includes("t-shirt") ||
      lowerConcept.includes("tank") ||
      lowerConcept.includes("top") ||
      lowerConcept.includes("sweater") ||
      lowerConcept.includes("cardigan")
    ) {
      category = "top";
    } else if (
      lowerConcept.includes("jean") ||
      lowerConcept.includes("pants") ||
      lowerConcept.includes("short") ||
      lowerConcept.includes("skirt") ||
      lowerConcept.includes("trouser")
    ) {
      category = "bottom";
    } else if (
      lowerConcept.includes("shoe") ||
      lowerConcept.includes("sneaker") ||
      lowerConcept.includes("heel") ||
      lowerConcept.includes("boot")
    ) {
      category = "shoe";
    }

    if (category === "accessory") {
      console.log(`⏭️  Skipping accessory item: ${conceptName}`);
      return null;
    }

    let aiDescription = conceptName;
    let colors = { colorname: "Unknown", colorvalue: "#808080" };
    let generatedName = getDefaultName(category, subcategory as any, "Unknown");

    try {
      const aiResult = await generateApparelDescription(
        isolatedImageUrl || croppedItem.croppedImageUrl,
      );
      aiDescription = aiResult.description;
      colors = {
        colorname: aiResult.color.name,
        colorvalue: aiResult.color.hex,
      };
      generatedName = aiResult.name;
    } catch (error) {
      console.warn(
        "⚠️  Failed to generate AI description, using fallback:",
        error,
      );
    }

    const apparelData = {
      userId,
      category: category,
      subcategory: subcategory as any,
      brand: getDefaultBrand(),
      name: generatedName,
      status: "complete" as const,
      description: aiDescription,
      material: getDefaultMaterial(),
      colors: colors,
      favorite: false,
      urlRaw: croppedItem.croppedImageUrl,
      urlProcessed: isolatedImageUrl || croppedItem.croppedImageUrl,
      originalUploadedImageUrl: originalUploadedImageUrl,
    };

    return {
      apparelData,
      category,
      conceptName,
      boundingBox: croppedItem.boundingBox,
      confidence: croppedItem.confidence,
      regionId: croppedItem.regionId,
    };
  } catch (error) {
    console.error(
      `❌ Error preparing apparel data (outerwear variant):`,
      error,
    );
    return null;
  }
};

// is being used in resolver/apparel.ts
export const bulkCreateApparelsFromCroppedItems = async (
  croppedItems: CroppedImage[],
  userId: number,
  isolatedItems?: Array<{
    regionId: number;
    isolatedImageUrl: string;
    isolatedImageGsUri?: string;
    success: boolean;
  }>,
  originalUploadedImageUrl?: string,
): Promise<{ success: Apparel[]; failed: CroppedImage[] }> => {
  const success: Apparel[] = [];
  const failed: CroppedImage[] = [];

  console.log(
    `\n🔍 [APPAREL-BULK] Processing ${croppedItems.length} detected items from image...`,
  );
  console.log(
    `   Cropped items: ${croppedItems.map((item) => `${item.conceptName} (region ${item.regionId})`).join(", ")}`,
  );
  console.log(`   Isolated items received: ${isolatedItems?.length || 0}`);
  if (isolatedItems && isolatedItems.length > 0) {
    console.log(
      `   Isolated items: ${isolatedItems.map((item) => `region ${item.regionId} (${item.success ? "success" : "failed"})`).join(", ")}`,
    );
  }

  // Note: Overlap filtering is now done earlier in clothingIsolationService
  // before expensive Gemini API calls and background removal operations
  // This prevents duplicate processing of the same clothing item
  const filteredItems = croppedItems;

  console.log(
    `📦 [APPAREL-BULK] Preparing ${filteredItems.length} apparel items (NOT saving to DB yet)...`,
  );

  // STEP 1: Prepare all apparel data WITHOUT saving to database
  type PreparedItem = {
    apparelData: any;
    category: string;
    conceptName: string;
    boundingBox: any;
    confidence: number;
    regionId: number;
  };

  const preparedItems: PreparedItem[] = [];

  console.log(`\n🔧 [APPAREL-BULK] Preparing apparel data...`);
  for (let i = 0; i < filteredItems.length; i++) {
    const item = filteredItems[i];
    try {
      console.log(
        `   Preparing ${i + 1}/${filteredItems.length}: ${item.conceptName} (region ${item.regionId})`,
      );

      // Find corresponding isolated item if available
      const isolatedItem = isolatedItems?.find(
        (isolated) => isolated.regionId === item.regionId && isolated.success,
      );

      if (isolatedItem) {
        console.log(
          `   Using isolated image: ${isolatedItem.isolatedImageUrl}`,
        );
      }

      const prepared = await prepareApparelDataFromCroppedItemWithOuterwear(
        item,
        userId,
        isolatedItem?.isolatedImageUrl,
        isolatedItem?.isolatedImageGsUri,
        originalUploadedImageUrl,
      );

      if (prepared) {
        preparedItems.push(prepared);
        console.log(`   ✅ Prepared: ${prepared.conceptName}`);
      } else {
        console.log(`   ⏭️  Skipped (likely accessory)`);
      }
    } catch (error) {
      console.error(`   ❌ Error preparing item ${item.conceptName}:`, error);
      failed.push(item);
    }
  }

  console.log(
    `📦 Prepared ${preparedItems.length} items (${filteredItems.length - preparedItems.length} accessories skipped)`,
  );

  // STEP 2: Run all deduplication logic on prepared data (in memory, no DB operations)
  let validPreparedItems = [...preparedItems];

  // === LOGIC 1: Ensure only ONE item per category ===
  // Group items by category
  const itemsByCategory: { [key: string]: PreparedItem[] } = {};
  for (const item of validPreparedItems) {
    if (!itemsByCategory[item.category]) {
      itemsByCategory[item.category] = [];
    }
    itemsByCategory[item.category].push(item);
  }

  console.log(
    `\n🏷️  Items by category:`,
    Object.entries(itemsByCategory)
      .map(([cat, items]) => `${cat}: ${items.length}`)
      .join(", "),
  );

  // Process each category - keep only ONE item per category
  const itemsToSkip: PreparedItem[] = [];

  for (const [category, items] of Object.entries(itemsByCategory)) {
    if (items.length > 1) {
      console.log(
        `\n🔄 Multiple ${category}s detected (${items.length}). Selecting best one...`,
      );

      // Get item data with confidence and area (already in prepared items)
      const itemsWithData = items.map((prepItem) => ({
        preparedItem: prepItem,
        confidence: prepItem.confidence,
        area: calculateBoundingBoxArea(prepItem.boundingBox),
        conceptName: prepItem.conceptName,
      }));

      // Sort by: confidence (60%) + area (40%)
      itemsWithData.sort((a, b) => {
        const scoreA = a.confidence * 0.6 + a.area * 100 * 0.4;
        const scoreB = b.confidence * 0.6 + b.area * 100 * 0.4;
        return scoreB - scoreA;
      });

      // Keep the best one, mark others for removal
      const bestItem = itemsWithData[0];
      console.log(
        `   ✅ Keeping: ${bestItem.conceptName} (confidence: ${(bestItem.confidence * 100).toFixed(1)}%, area: ${bestItem.area.toFixed(4)})`,
      );

      for (let i = 1; i < itemsWithData.length; i++) {
        const itemToSkip = itemsWithData[i];
        console.log(
          `   ⏭️  Skipping duplicate ${category}: ${itemToSkip.conceptName} (confidence: ${(itemToSkip.confidence * 100).toFixed(1)}%, area: ${itemToSkip.area.toFixed(4)})`,
        );
        itemsToSkip.push(itemToSkip.preparedItem);
      }
    }
  }

  // Remove duplicate items from the array (in memory, no DB operations yet)
  validPreparedItems = validPreparedItems.filter(
    (item) => !itemsToSkip.includes(item),
  );

  console.log(
    `\n📦 After per-category deduplication: ${validPreparedItems.length} items remaining`,
  );

  // === LOGIC 2: Handle multiple top detections (special case for top vs outerwear) ===
  const tops = validPreparedItems.filter((item) => item.category === "top");

  if (tops.length > 1) {
    console.log(
      `\n🔄 Multiple tops still detected (${tops.length}). Applying additional top-specific logic...`,
    );

    // Get top items with their data
    const topItemsWithData = tops.map((item) => ({
      preparedItem: item,
      confidence: item.confidence,
      area: calculateBoundingBoxArea(item.boundingBox),
      conceptName: item.conceptName,
    }));

    // Identify which items are originally "top" vs "outerwear" based on concept name
    const originalTops = topItemsWithData.filter(
      (item) =>
        !item.conceptName.toLowerCase().includes("outerwear") &&
        !item.conceptName.toLowerCase().includes("jacket") &&
        !item.conceptName.toLowerCase().includes("coat") &&
        !item.conceptName.toLowerCase().includes("blazer"),
    );
    const originalOuterwear = topItemsWithData.filter(
      (item) =>
        item.conceptName.toLowerCase().includes("outerwear") ||
        item.conceptName.toLowerCase().includes("jacket") ||
        item.conceptName.toLowerCase().includes("coat") ||
        item.conceptName.toLowerCase().includes("blazer"),
    );

    let itemToKeep: (typeof topItemsWithData)[0] | null = null;

    // Logic: If both original top and outerwear exist
    if (originalTops.length > 0 && originalOuterwear.length > 0) {
      console.log("   📋 Both 'top' and 'outerwear' concepts detected");

      // Check if any original top has confidence >= 50%
      const validTops = originalTops.filter((item) => item.confidence >= 0.5);
      const validOuterwear = originalOuterwear.filter(
        (item) => item.confidence >= 0.5,
      );

      if (validTops.length === 0 && validOuterwear.length > 0) {
        // No valid top but valid outerwear exists - use outerwear
        itemToKeep = validOuterwear.reduce((max, current) =>
          current.area > max.area ? current : max,
        );
        console.log(`   ✅ Top confidence < 50%, using outerwear as top`);
      } else if (validTops.length > 0 && validOuterwear.length > 0) {
        // Both have valid confidence - compare areas
        const allValid = [...validTops, ...validOuterwear];
        itemToKeep = allValid.reduce((max, current) =>
          current.area > max.area ? current : max,
        );
        console.log(
          `   ✅ Both have valid confidence, keeping larger area item`,
        );
      } else if (validTops.length > 0) {
        // Only tops are valid
        itemToKeep = validTops.reduce((max, current) =>
          current.area > max.area ? current : max,
        );
        console.log(`   ✅ Using valid top item`);
      } else {
        // Neither are valid, use largest area
        itemToKeep = topItemsWithData.reduce((max, current) =>
          current.area > max.area ? current : max,
        );
        console.log(
          `   ⚠️  No items meet confidence threshold, using largest area`,
        );
      }
    } else {
      // Only one type detected (all tops or all outerwear) - keep largest
      itemToKeep = topItemsWithData.reduce((max, current) =>
        current.area > max.area ? current : max,
      );
      console.log(`   ✅ Only one concept type detected, keeping largest`);
    }

    console.log(
      `   📏 Keeping: ${itemToKeep.conceptName} (confidence: ${(itemToKeep.confidence * 100).toFixed(1)}%, area: ${itemToKeep.area.toFixed(4)})`,
    );

    // Remove other tops (in memory, no DB operations)
    validPreparedItems = validPreparedItems.filter((item) => {
      if (item.category === "top" && item !== itemToKeep!.preparedItem) {
        console.log(`   ⏭️  Skipping duplicate top: ${item.conceptName}`);
        return false;
      }
      return true;
    });
  }

  // === LOGIC 3: Handle dress vs top+bottom collision ===
  const dresses = validPreparedItems.filter(
    (item) => item.category === "dress",
  );
  const bottoms = validPreparedItems.filter(
    (item) => item.category === "bottom",
  );
  const remainingTops = validPreparedItems.filter(
    (item) => item.category === "top",
  );

  if (dresses.length > 0 && (remainingTops.length > 0 || bottoms.length > 0)) {
    console.log(
      "\n👗 Dress and top/bottom detected. Comparing bounding box areas...",
    );

    // Calculate dress area
    const dressWithArea = dresses.map((item) => ({
      preparedItem: item,
      area: calculateBoundingBoxArea(item.boundingBox),
    }));

    // Calculate combined top+bottom area
    const topBottomItems = [...remainingTops, ...bottoms].map((item) => ({
      preparedItem: item,
      area: calculateBoundingBoxArea(item.boundingBox),
    }));

    const totalDressArea = dressWithArea.reduce((sum, d) => sum + d.area, 0);
    const totalTopBottomArea = topBottomItems.reduce(
      (sum, tb) => sum + tb.area,
      0,
    );

    console.log(`   📏 Dress area: ${totalDressArea.toFixed(4)}`);
    console.log(`   📏 Top+Bottom area: ${totalTopBottomArea.toFixed(4)}`);

    // Threshold: if dress area is less than 60% of top+bottom area, it's "drastically less"
    const DRESS_AREA_THRESHOLD = 0.6;
    const dressToTopBottomRatio =
      totalTopBottomArea > 0 ? totalDressArea / totalTopBottomArea : 1;

    if (dressToTopBottomRatio < DRESS_AREA_THRESHOLD) {
      // Dress is drastically smaller - keep top+bottom, remove dress
      console.log(
        `   ⏭️  Dress area is ${(dressToTopBottomRatio * 100).toFixed(
          1,
        )}% of top+bottom (< ${
          DRESS_AREA_THRESHOLD * 100
        }%). Keeping top+bottom instead.`,
      );

      validPreparedItems = validPreparedItems.filter((item) => {
        if (item.category === "dress") {
          console.log(`   ⏭️  Skipping dress: ${item.conceptName}`);
          return false;
        }
        return true;
      });
    } else {
      // Dress is comparable or larger - keep dress, remove top+bottom
      console.log(
        `   ✅ Dress area is ${(dressToTopBottomRatio * 100).toFixed(
          1,
        )}% of top+bottom (>= ${
          DRESS_AREA_THRESHOLD * 100
        }%). Keeping dress instead.`,
      );

      validPreparedItems = validPreparedItems.filter((item) => {
        if (item.category === "top" || item.category === "bottom") {
          console.log(
            `   ⏭️  Skipping ${item.category}: ${item.conceptName} (dress takes priority)`,
          );
          return false;
        }
        return true;
      });
    }
  }

  // STEP 3: Now save only the final filtered items to database
  console.log(
    `\n💾 [APPAREL-BULK] Saving ${validPreparedItems.length} final items to database...`,
  );

  for (let i = 0; i < validPreparedItems.length; i++) {
    const prepItem = validPreparedItems[i];
    try {
      console.log(
        `   Saving ${i + 1}/${validPreparedItems.length}: ${prepItem.conceptName}`,
      );
      const newApparel = await Apparel.create(prepItem.apparelData);
      success.push(newApparel);
      console.log(`   ✅ Saved with ID: ${newApparel.id}`);
    } catch (error) {
      console.error(`   ❌ Error saving ${prepItem.conceptName}:`, error);
      // Find the original cropped item for failed list
      const originalItem = croppedItems.find(
        (item) => item.regionId === prepItem.regionId,
      );
      if (originalItem) {
        failed.push(originalItem);
      }
    }
  }

  // Add final valid apparels to success array
  // success.push(...validApparels);

  console.log(
    `\n✅ [APPAREL-BULK] Final result: ${success.length} items will be returned`,
  );
  console.log(
    `   Categories: ${Object.entries(
      success.reduce(
        (acc, item) => {
          acc[item.category] = (acc[item.category] || 0) + 1;
          return acc;
        },
        {} as { [key: string]: number },
      ),
    )
      .map(([cat, count]) => `${cat}: ${count}`)
      .join(", ")}`,
  );
  console.log(`   Apparel IDs: ${success.map((item) => item.id).join(", ")}`);
  console.log(
    `   Descriptions: ${success.map((item) => item.description).join(", ")}`,
  );

  return { success, failed };
};

// is being used in resolver/apparel.ts
export const getUserApparelsQuery = async (
  _: any,
  { limit = 50, offset = 0 }: { limit?: number; offset?: number },
  context: any,
) => {
  try {
    // Authenticate user and get userId from token
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
        apparels: [],
        pagination: { total: 0, limit: 0, offset: 0, hasMore: false },
      };
    }

    const userId = authResult.user.userId;

    const apparels = await Apparel.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    const total = await Apparel.count({ where: { userId } });

    // Add name field to apparels and ensure colors are properly formatted
    const apparelsWithNames = apparels.map((apparel) => {
      const apparelData = apparel.toJSON();

      // Add name field with default value if not present or null
      if (!apparelData.name) {
        // Extract primary color from colors
        const primaryColor = getPrimaryColorName(apparelData.colors);

        apparelData.name = getDefaultName(
          apparelData.category,
          apparelData.subcategory,
          primaryColor,
        );
      }

      // Ensure colors field is properly formatted for GraphQL
      apparelData.colors = formatColorsForGraphQL(apparelData.colors);

      return apparelData;
    });

    return {
      success: true,
      message: "Apparels retrieved successfully",
      apparels: apparelsWithNames,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to retrieve apparels",
      apparels: [],
      pagination: { total: 0, limit: 0, offset: 0, hasMore: false },
    };
  }
};

// is being used in resolver/apparel.ts
export const getUserRecentlyAddedApparelsQuery = async ({
  userId,
}: // limit = 10,
// offset = 0,
{
  userId: number;
  // limit?: number;
  // offset?: number
}): Promise<IdUrlPair[]> => {
  try {
    const limit = 10;
    const apparels = await Apparel.findAll({
      where: { userId },
      order: [["createdAt", "DESC"]],
      limit,
      attributes: ["id", "urlProcessed"], // only fetch what we need
    });
    console.log("apparels", apparels);
    // Map into IdUrlPair[]
    const formatted = apparels.map((a) => ({
      id: Number(a.id),
      url: a.urlProcessed ?? "",
    }));

    return formatted;
  } catch (error) {
    console.error("Error fetching recently added apparels:", error);
    return [];
  }
};

// is being used in resolver/apparel.ts
export const getUserApparelByIdQuery = async (
  _: any,
  { apparelId }: { apparelId: string },
  context: any,
) => {
  try {
    // Authenticate user and get userId from token
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
        apparel: null,
      };
    }

    const userId = authResult.user.userId;

    const apparel = await Apparel.findOne({
      where: { id: apparelId, userId },
    });

    if (!apparel) {
      return {
        success: false,
        message: "Apparel not found or you don't have permission to access it",
        apparel: null,
      };
    }

    const apparelData = apparel.toJSON();

    // Add name field with default value if not present or null
    if (!apparelData.name) {
      // Extract primary color from colors
      const primaryColor = getPrimaryColorName(apparelData.colors);

      apparelData.name = getDefaultName(
        apparelData.category,
        apparelData.subcategory,
        primaryColor,
      );
    }

    // Ensure colors field is properly formatted for GraphQL
    apparelData.colors = formatColorsForGraphQL(apparelData.colors);

    return {
      success: true,
      message: "Apparel retrieved successfully",
      apparel: apparelData,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to retrieve apparel",
      apparel: null,
    };
  }
};

// is being used in resolver/apparel.ts
export const deleteApparelMutation = async (
  _: any,
  { id }: { id: string },
  context: any,
) => {
  try {
    // Authenticate user and get userId from token
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
      };
    }

    const userId = authResult.user.userId;

    const apparel = await Apparel.findOne({
      where: { id, userId },
    });

    if (!apparel) {
      return {
        success: false,
        message: "Apparel not found or you don't have permission to delete it",
      };
    }

    await apparel.destroy();

    return {
      success: true,
      message: "Apparel deleted successfully",
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to delete apparel",
    };
  }
};

// is being used in resolver/apparel.ts
export const updateApparelMutation = async (
  _: any,
  args: {
    id: string;
    category?: string;
    subcategory?: string;
    brand?: string;
    name?: string;
    description?: string;
    material?: string;
    colors?: { colorname: string; colorvalue: string }[];
    favorite?: boolean;
  },
  context: any,
) => {
  try {
    // Authenticate user and get userId from token
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
        apparel: null,
      };
    }

    const userId = authResult.user.userId;

    const apparel = await Apparel.findOne({
      where: { id: args.id, userId },
    });

    if (!apparel) {
      return {
        success: false,
        message: "Apparel not found or you don't have permission to update it",
        apparel: null,
      };
    }

    const updateData: any = {};
    if (args.category !== undefined) updateData.category = args.category;
    if (args.subcategory !== undefined)
      updateData.subcategory = args.subcategory;
    if (args.brand !== undefined) updateData.brand = args.brand;
    if (args.name !== undefined) updateData.name = args.name;
    if (args.description !== undefined)
      updateData.description = args.description;
    if (args.material !== undefined) updateData.material = args.material;
    if (args.favorite !== undefined) updateData.favorite = args.favorite;

    // Validate and sanitize colors if provided
    if (args.colors !== undefined) {
      let validColors = args.colors || [];
      validColors = validColors
        .filter((color) => color && color.colorname && color.colorvalue)
        .map((color) => ({
          colorname: color.colorname.trim(),
          colorvalue: color.colorvalue.trim(),
        }));

      // If no valid colors, provide default
      if (validColors.length === 0) {
        validColors = [{ colorname: "Unknown", colorvalue: "#000000" }];
      }

      updateData.colors = validColors;

      // If no explicit name was provided but colors were updated,
      // regenerate the name based on the new primary color
      if (args.name === undefined) {
        const primaryColor =
          validColors.length > 0 ? validColors[0].colorname : undefined;
        const currentCategory = updateData.category || apparel.get("category");
        const currentSubcategory =
          updateData.subcategory || apparel.get("subcategory");

        updateData.name = getDefaultName(
          currentCategory,
          currentSubcategory,
          primaryColor,
        );
      }
    }

    await apparel.update(updateData);

    return {
      success: true,
      message: "Apparel updated successfully",
      apparel,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to update apparel",
      apparel: null,
    };
  }
};

// is being used in resolver/apparel.ts
export const searchApparelsQuery = async (
  _: any,
  {
    searchTerm,
    limit = 50,
    offset = 0,
  }: { searchTerm: string; limit?: number; offset?: number },
  context: any,
) => {
  try {
    // Authenticate user and get userId from token
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
        apparels: [],
        pagination: { total: 0, limit: 0, offset: 0, hasMore: false },
      };
    }

    const userId = authResult.user.userId;

    // Trim and validate search term
    const trimmedSearchTerm = searchTerm.trim();

    if (!trimmedSearchTerm) {
      return {
        success: false,
        message: "Search term cannot be empty",
        apparels: [],
        pagination: { total: 0, limit: 0, offset: 0, hasMore: false },
      };
    }

    // Search for apparels where name contains the search term (case-insensitive)
    const apparels = await Apparel.findAll({
      where: {
        userId,
        name: {
          [Op.iLike]: `%${trimmedSearchTerm}%`, // Case-insensitive LIKE search
        },
      },
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    // Get total count for pagination
    const total = await Apparel.count({
      where: {
        userId,
        name: {
          [Op.iLike]: `%${trimmedSearchTerm}%`,
        },
      },
    });

    // Add name field to apparels and ensure colors are properly formatted
    const apparelsWithNames = apparels.map((apparel) => {
      const apparelData = apparel.toJSON();

      // Add name field with default value if not present or null
      if (!apparelData.name) {
        // Extract primary color from colors
        const primaryColor = getPrimaryColorName(apparelData.colors);

        apparelData.name = getDefaultName(
          apparelData.category,
          apparelData.subcategory,
          primaryColor,
        );
      }

      // Ensure colors field is properly formatted for GraphQL
      apparelData.colors = formatColorsForGraphQL(apparelData.colors);

      return apparelData;
    });

    return {
      success: true,
      message: `Found ${total} apparel(s) matching "${trimmedSearchTerm}"`,
      apparels: apparelsWithNames,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to search apparels",
      apparels: [],
      pagination: { total: 0, limit: 0, offset: 0, hasMore: false },
    };
  }
};

// New query for filtered and sorted apparels
export const getFilteredUserApparelsQuery = async (
  _: any,
  {
    limit = 50,
    offset = 0,
    sortBy = "NEWEST",
    colors,
    categories,
    favorite,
  }: {
    limit?: number;
    offset?: number;
    sortBy?: "NEWEST" | "OLDEST" | "TOP_RATED";
    colors?: string[];
    categories?: string[];
    favorite?: boolean;
  },
  context: any,
) => {
  try {
    // Authenticate user and get userId from token
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
        apparels: [],
        pagination: { total: 0, limit: 0, offset: 0, hasMore: false },
      };
    }

    const userId = authResult.user.userId;

    // Build where clause based on filters
    const whereClause: any = { userId };

    // Filter by categories if provided
    if (categories && categories.length > 0) {
      whereClause.category = { [Op.in]: categories };
    }

    // Filter by favorite if provided
    if (favorite !== undefined) {
      whereClause.favorite = favorite;
    }

    // Determine sort order
    let orderClause: any[];
    switch (sortBy) {
      case "OLDEST":
        orderClause = [["createdAt", "ASC"]];
        break;
      case "TOP_RATED":
        // For now, sort by favorite first, then newest
        // You can modify this to use a rating field when available
        orderClause = [
          ["favorite", "DESC"],
          ["createdAt", "DESC"],
        ];
        break;
      case "NEWEST":
      default:
        orderClause = [["createdAt", "DESC"]];
        break;
    }

    // First fetch without color filter to get total count if needed
    let apparels = await Apparel.findAll({
      where: whereClause,
      order: orderClause,
    });

    // Filter by colors if provided (need to do this in memory since colors is JSON)
    if (colors && colors.length > 0) {
      apparels = apparels.filter((apparel) => {
        const rawColors = apparel.colors;

        // Normalize to an array so we can handle:
        // - old format: array of color objects
        // - new format: single color object
        let apparelColors: Array<{ colorname: string; colorvalue: string }> =
          [];

        if (Array.isArray(rawColors)) {
          apparelColors = rawColors;
        } else if (
          rawColors &&
          typeof rawColors === "object" &&
          "colorname" in rawColors &&
          "colorvalue" in rawColors
        ) {
          apparelColors = [
            {
              colorname: (rawColors as any).colorname,
              colorvalue: (rawColors as any).colorvalue,
            },
          ];
        }

        if (apparelColors.length === 0) return false;

        // Check if any of the apparel's colors match the requested colors
        return apparelColors.some((apparelColor: any) => {
          return colors.some(
            (requestedColor) =>
              apparelColor.colorname?.toLowerCase() ===
              requestedColor.toLowerCase(),
          );
        });
      });
    }

    // Get total count after filtering
    const total = apparels.length;

    // Apply pagination
    const paginatedApparels = apparels.slice(offset, offset + limit);

    // Add name field to apparels and ensure colors are properly formatted
    const apparelsWithNames = paginatedApparels.map((apparel) => {
      const apparelData = apparel.toJSON();

      // Add name field with default value if not present or null
      if (!apparelData.name) {
        // Extract primary color from colors
        const primaryColor = getPrimaryColorName(apparelData.colors);

        apparelData.name = getDefaultName(
          apparelData.category,
          apparelData.subcategory,
          primaryColor,
        );
      }

      // Ensure colors field is properly formatted for GraphQL
      apparelData.colors = formatColorsForGraphQL(apparelData.colors);

      return apparelData;
    });

    return {
      success: true,
      message: "Apparels retrieved successfully",
      apparels: apparelsWithNames,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to retrieve filtered apparels",
      apparels: [],
      pagination: { total: 0, limit: 0, offset: 0, hasMore: false },
    };
  }
};

// New query to get all available colors in user's wardrobe
export const getUserWardrobeColorsQuery = async (
  _: any,
  __: any,
  context: any,
) => {
  try {
    // Authenticate user and get userId from token
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
        colors: [],
      };
    }

    const userId = authResult.user.userId;

    // Fetch all apparels for the user
    const apparels = await Apparel.findAll({
      where: { userId },
      attributes: ["colors"],
    });

    // Collect all colors with their counts
    const colorMap = new Map<
      string,
      { colorname: string; colorvalue: string; count: number }
    >();

    apparels.forEach((apparel) => {
      const rawColors = apparel.colors;

      // Normalize colors to an array so we can handle:
      // - old format: array of color objects
      // - new format: single color object
      // - any other unexpected but truthy value
      let colorsArray: Array<{ colorname: string; colorvalue: string }> = [];

      if (Array.isArray(rawColors)) {
        colorsArray = rawColors;
      } else if (
        rawColors &&
        typeof rawColors === "object" &&
        "colorname" in rawColors &&
        "colorvalue" in rawColors
      ) {
        colorsArray = [
          {
            colorname: (rawColors as any).colorname,
            colorvalue: (rawColors as any).colorvalue,
          },
        ];
      }

      colorsArray.forEach((color) => {
        if (color && color.colorname && color.colorvalue) {
          const colorKey = color.colorname.toLowerCase();
          if (colorMap.has(colorKey)) {
            const existing = colorMap.get(colorKey)!;
            existing.count += 1;
          } else {
            colorMap.set(colorKey, {
              colorname: color.colorname,
              colorvalue: color.colorvalue,
              count: 1,
            });
          }
        }
      });
    });

    // Convert to array and sort by count (most common first)
    const colorsArray = Array.from(colorMap.values()).sort(
      (a, b) => b.count - a.count,
    );

    return {
      success: true,
      message: "Wardrobe colors retrieved successfully",
      colors: colorsArray,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to retrieve wardrobe colors",
      colors: [],
    };
  }
};
