import OpenAI from "openai";
import { Apparel } from "../models/apparel.model";
import { authenticateUser } from "./helper/auth";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface ShuffleResult {
  success: boolean;
  message: string;
  topId?: number;
  bottomId?: number;
  shoeId?: number;
  dressId?: number;
  outerwearId?: number;
  topUrl?: string;
  bottomUrl?: string;
  shoeUrl?: string;
  dressUrl?: string;
  outerwearUrl?: string;
  explanation?: string;
}

interface ShuffleInput {
  topId?: number;
  bottomId?: number;
  shoeId?: number;
  dressId?: number;
  outerwearId?: number;
}

interface ApparelItem {
  id: number;
  category: string;
  subcategory: string;
  name?: string;
  brand?: string;
  description?: string;
  material: string;
  colors: any;
  urlProcessed?: string;
}

/**
 * Validate shuffle constraints
 */
function validateConstraints(args: ShuffleInput): {
  valid: boolean;
  error?: string;
} {
  const { topId, bottomId, shoeId, dressId, outerwearId } = args;

  // Check if all regular items are pinned (nothing to shuffle)
  if (topId && bottomId && shoeId && outerwearId && !dressId) {
    return {
      valid: false,
      error:
        "All items are pinned (top, outerwear, bottom, shoes). Remove one pin to continue shuffling.",
    };
  }

  if (topId && bottomId && shoeId && !outerwearId && !dressId) {
    return {
      valid: false,
      error:
        "All 3 items are pinned (top, bottom, shoes). Remove one pin to continue shuffling.",
    };
  }

  // Check if dress + top/bottom combination (conflicting)
  if (dressId && (topId || bottomId)) {
    return {
      valid: false,
      error:
        "Cannot pin dress with top or bottom. Dress replaces top and bottom.",
    };
  }

  // Check if dress + shoes are both pinned (nothing to shuffle)
  if (dressId && shoeId) {
    return {
      valid: false,
      error:
        "Both dress and shoes are pinned. Remove one pin to continue shuffling.",
    };
  }

  return { valid: true };
}

/**
 * Fetch locked items from database
 */
async function fetchLockedItems(
  args: ShuffleInput,
  userId: number,
): Promise<{
  valid: boolean;
  error?: string;
  top?: ApparelItem;
  bottom?: ApparelItem;
  shoe?: ApparelItem;
  dress?: ApparelItem;
  outerwear?: ApparelItem;
}> {
  try {
    const result: any = { valid: true };
    const lockedIds = [
      args.topId,
      args.bottomId,
      args.shoeId,
      args.dressId,
      args.outerwearId,
    ].filter(Boolean);

    if (lockedIds.length === 0) {
      return result; // No locked items
    }

    // Fetch all locked items
    const items = await Apparel.findAll({
      where: {
        id: lockedIds,
        userId: userId,
        status: "complete",
      },
      attributes: [
        "id",
        "category",
        "subcategory",
        "name",
        "brand",
        "description",
        "material",
        "colors",
        "urlProcessed",
      ],
    });

    // Validate each locked item
    if (args.topId) {
      const top = items.find((item) => item.id === args.topId);
      if (!top) {
        return {
          valid: false,
          error: `Top with ID ${args.topId} not found in your wardrobe.`,
        };
      }
      if (top.category !== "top" && top.category !== "outerwear") {
        return { valid: false, error: `Item ${args.topId} is not a top.` };
      }
      result.top = apparelToSimpleFormat(top);
    }

    if (args.bottomId) {
      const bottom = items.find((item) => item.id === args.bottomId);
      if (!bottom) {
        return {
          valid: false,
          error: `Bottom with ID ${args.bottomId} not found in your wardrobe.`,
        };
      }
      if (bottom.category !== "bottom") {
        return {
          valid: false,
          error: `Item ${args.bottomId} is not a bottom.`,
        };
      }
      result.bottom = apparelToSimpleFormat(bottom);
    }

    if (args.shoeId) {
      const shoe = items.find((item) => item.id === args.shoeId);
      if (!shoe) {
        return {
          valid: false,
          error: `Shoe with ID ${args.shoeId} not found in your wardrobe.`,
        };
      }
      if (shoe.category !== "shoe") {
        return { valid: false, error: `Item ${args.shoeId} is not a shoe.` };
      }
      result.shoe = apparelToSimpleFormat(shoe);
    }

    if (args.dressId) {
      const dress = items.find((item) => item.id === args.dressId);
      if (!dress) {
        return {
          valid: false,
          error: `Dress with ID ${args.dressId} not found in your wardrobe.`,
        };
      }
      if (dress.category !== "dress") {
        return { valid: false, error: `Item ${args.dressId} is not a dress.` };
      }
      result.dress = apparelToSimpleFormat(dress);
    }

    if (args.outerwearId) {
      const outerwear = items.find((item) => item.id === args.outerwearId);
      if (!outerwear) {
        return {
          valid: false,
          error: `Outerwear with ID ${args.outerwearId} not found in your wardrobe.`,
        };
      }
      if (outerwear.category !== "outerwear") {
        return {
          valid: false,
          error: `Item ${args.outerwearId} is not an outerwear item.`,
        };
      }
      result.outerwear = apparelToSimpleFormat(outerwear);
    }

    return result;
  } catch (error) {
    console.error("❌ Error fetching locked items:", error);
    return { valid: false, error: "Failed to fetch locked items." };
  }
}

/**
 * Shuffle and generate a new outfit suggestion using AI
 * This function analyzes the user's wardrobe and creates a matching outfit
 * Can accept locked items (topId, bottomId, shoeId, dressId) that won't be changed
 */
export const shuffleOutfitMutation = async (
  _: any,
  args: ShuffleInput,
  context: any,
): Promise<ShuffleResult> => {
  try {
    // Authenticate user
    const authHeader = context.req?.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        success: false,
        message: "Authentication required. Please provide a valid token.",
      };
    }

    const token = authHeader.substring(7);
    const authResult = await authenticateUser(context);

    if ("error" in authResult || !authResult.user) {
      return {
        success: false,
        message: authResult.error || "Invalid authentication token.",
      };
    }

    const user = authResult.user;

    console.log(`🎲 Shuffling outfit for user ${user.userId}...`);
    console.log(`   Constraints:`, args);

    // Validate constraints
    const constraintValidation = validateConstraints(args);
    if (!constraintValidation.valid) {
      return {
        success: false,
        message: constraintValidation.error!,
      };
    }

    // Fetch locked items if provided
    const lockedItems = await fetchLockedItems(args, user.userId);
    if (!lockedItems.valid) {
      return {
        success: false,
        message: lockedItems.error!,
      };
    }

    // Determine what needs to be shuffled based on constraints
    const isDressOutfit =
      !!args.dressId || (lockedItems.dress && !args.topId && !args.bottomId);
    const needsTop = !isDressOutfit && !args.topId;
    const needsBottom = !isDressOutfit && !args.bottomId;
    const needsShoe = !args.shoeId;
    const needsDress = isDressOutfit && !args.dressId;
    // Outerwear is optional — only shuffle it when not locked and not a dress outfit
    const needsOuterwear = !isDressOutfit && !args.outerwearId;

    console.log(
      `   Shuffle needs: ${needsTop ? "top " : ""}${needsBottom ? "bottom " : ""}${needsShoe ? "shoe " : ""}${needsDress ? "dress " : ""}${needsOuterwear ? "outerwear(optional)" : ""}`,
    );

    // Fetch all user's completed apparel items (excluding locked ones)
    const apparels = await Apparel.findAll({
      where: {
        userId: user.userId,
        status: "complete",
      },
      attributes: [
        "id",
        "category",
        "subcategory",
        "name",
        "brand",
        "description",
        "material",
        "colors",
        "urlProcessed",
      ],
    });

    if (apparels.length === 0) {
      return {
        success: false,
        message:
          "No apparel items found in your wardrobe. Please add some items first.",
      };
    }

    console.log(`   Found ${apparels.length} apparel items in wardrobe`);

    // Organize apparels by category (filter out locked items)
    // Outerwear is now its own separate pool — not mixed into tops
    const tops = apparels.filter(
      (a) => a.category === "top" && a.id !== args.topId,
    );
    const outerwears = apparels.filter(
      (a) => a.category === "outerwear" && a.id !== args.outerwearId,
    );
    const bottoms = apparels.filter(
      (a) => a.category === "bottom" && a.id !== args.bottomId,
    );
    const shoes = apparels.filter(
      (a) => a.category === "shoe" && a.id !== args.shoeId,
    );
    const dresses = apparels.filter(
      (a) => a.category === "dress" && a.id !== args.dressId,
    );

    console.log(
      `   Available for shuffle: ${tops.length} tops, ${outerwears.length} outerwears, ${bottoms.length} bottoms, ${shoes.length} shoes, ${dresses.length} dresses`,
    );

    // Shuffle the arrays to randomize the order before sending to AI
    shuffleArray(tops);
    shuffleArray(outerwears);
    shuffleArray(bottoms);
    shuffleArray(shoes);
    shuffleArray(dresses);

    // Check if user has enough items for shuffling
    if (isDressOutfit) {
      if (needsDress && dresses.length === 0) {
        return {
          success: false,
          message: "No dresses available to shuffle.",
        };
      }
      if (needsShoe && shoes.length === 0) {
        return {
          success: false,
          message: "No shoes available to shuffle.",
        };
      }
    } else {
      if (needsTop && tops.length === 0) {
        return {
          success: false,
          message: "No tops available to shuffle.",
        };
      }
      if (needsBottom && bottoms.length === 0) {
        return {
          success: false,
          message: "No bottoms available to shuffle.",
        };
      }
      if (needsShoe && shoes.length === 0) {
        return {
          success: false,
          message: "No shoes available to shuffle.",
        };
      }
    }

    // Use AI to suggest a matching outfit
    const aiSuggestion = await getAIOutfitSuggestion(
      {
        tops: tops.map((a) => apparelToSimpleFormat(a)),
        outerwears: outerwears.map((a) => apparelToSimpleFormat(a)),
        bottoms: bottoms.map((a) => apparelToSimpleFormat(a)),
        shoes: shoes.map((a) => apparelToSimpleFormat(a)),
        dresses: dresses.map((a) => apparelToSimpleFormat(a)),
      },
      lockedItems,
      {
        needsTop,
        needsBottom,
        needsShoe,
        needsDress,
        needsOuterwear,
      },
    );

    if (!aiSuggestion) {
      return {
        success: false,
        message:
          "Failed to generate outfit suggestion. Please try again later.",
      };
    }

    console.log("✅ AI suggested outfit:", aiSuggestion);

    // Fetch URLs for the final outfit items
    const finalTopId = args.topId || aiSuggestion.topId || 0;
    const finalBottomId = args.bottomId || aiSuggestion.bottomId || 0;
    const finalShoeId = args.shoeId || aiSuggestion.shoeId || 0;
    const finalDressId = args.dressId || aiSuggestion.dressId || 0;
    const finalOuterwearId = args.outerwearId || aiSuggestion.outerwearId || 0;

    const finalItemIds = [
      finalTopId,
      finalBottomId,
      finalShoeId,
      finalDressId,
      finalOuterwearId,
    ].filter((id) => id > 0);

    let topUrl, bottomUrl, shoeUrl, dressUrl, outerwearUrl;

    if (finalItemIds.length > 0) {
      const finalItems = await Apparel.findAll({
        where: {
          id: finalItemIds,
          userId: user.userId,
        },
        attributes: ["id", "urlProcessed", "category"],
      });

      finalItems.forEach((item) => {
        if (item.id === finalTopId) topUrl = item.urlProcessed;
        if (item.id === finalBottomId) bottomUrl = item.urlProcessed;
        if (item.id === finalShoeId) shoeUrl = item.urlProcessed;
        if (item.id === finalDressId) dressUrl = item.urlProcessed;
        if (item.id === finalOuterwearId) outerwearUrl = item.urlProcessed;
      });
    }

    // Merge locked items with AI suggestions
    return {
      success: true,
      message: "Outfit shuffled successfully!",
      topId: finalTopId,
      bottomId: finalBottomId,
      shoeId: finalShoeId,
      dressId: finalDressId,
      outerwearId: finalOuterwearId,
      topUrl,
      bottomUrl,
      shoeUrl,
      dressUrl,
      outerwearUrl,
      explanation: aiSuggestion.explanation,
    };
  } catch (error) {
    console.error("❌ Error in shuffle outfit:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to shuffle outfit. Please try again.",
    };
  }
};

/**
 * Fisher-Yates shuffle algorithm to randomize array order
 */
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Convert Apparel model to a simple format for AI processing
 */
function apparelToSimpleFormat(apparel: any): ApparelItem {
  return {
    id: apparel.id,
    category: apparel.category,
    subcategory: apparel.subcategory,
    name: apparel.name,
    brand: apparel.brand,
    description: apparel.description,
    material: apparel.material,
    colors: apparel.colors,
    urlProcessed: apparel.urlProcessed,
  };
}

/**
 * Use OpenAI to suggest a matching outfit from available items
 */
async function getAIOutfitSuggestion(
  wardrobe: {
    tops: ApparelItem[];
    outerwears: ApparelItem[];
    bottoms: ApparelItem[];
    shoes: ApparelItem[];
    dresses: ApparelItem[];
  },
  lockedItems: {
    top?: ApparelItem;
    bottom?: ApparelItem;
    shoe?: ApparelItem;
    dress?: ApparelItem;
    outerwear?: ApparelItem;
  },
  needs: {
    needsTop: boolean;
    needsBottom: boolean;
    needsShoe: boolean;
    needsDress: boolean;
    needsOuterwear: boolean;
  },
): Promise<{
  topId?: number;
  bottomId?: number;
  shoeId?: number;
  dressId?: number;
  outerwearId?: number;
  explanation: string;
} | null> {
  try {
    // Decide whether to suggest a dress outfit or top+bottom outfit
    const useDress = needs.needsDress || !!lockedItems.dress;

    const prompt = useDress
      ? buildDressOutfitPrompt(wardrobe, lockedItems, needs)
      : buildRegularOutfitPrompt(
          wardrobe,
          lockedItems,
          needs,
          wardrobe.outerwears,
        );

    console.log("🤖 Asking AI for outfit suggestion...");
    console.log("   Locked items:", lockedItems);

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a professional fashion stylist AI. Your job is to create stylish, matching outfits by analyzing clothing items' descriptions, colors, materials, and styles. 

Consider these fashion principles:
- Color coordination (complementary, analogous, or monochromatic)
- Style consistency (casual with casual, formal with formal)
- Seasonal appropriateness
- Material compatibility
- Balance and proportion

Return ONLY valid JSON with the outfit suggestion.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      max_tokens: 500,
      temperature: 0.9, // Higher temperature for more creative and varied suggestions
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    console.log("📝 AI Response:", content);

    const parsed = JSON.parse(content);

    // Validate the response based on what was requested
    if (useDress) {
      // For dress outfits, only validate what we asked for
      if (needs.needsDress && !parsed.dressId) {
        throw new Error("Invalid AI response: missing dressId");
      }
      if (needs.needsShoe && !parsed.shoeId) {
        throw new Error("Invalid AI response: missing shoeId");
      }
      return {
        dressId: parsed.dressId,
        shoeId: parsed.shoeId,
        explanation: parsed.explanation || "A stylish dress outfit",
      };
    } else {
      // For regular outfits, only validate what we asked for
      if (needs.needsTop && !parsed.topId) {
        throw new Error("Invalid AI response: missing topId");
      }
      if (needs.needsBottom && !parsed.bottomId) {
        throw new Error("Invalid AI response: missing bottomId");
      }
      if (needs.needsShoe && !parsed.shoeId) {
        throw new Error("Invalid AI response: missing shoeId");
      }
      return {
        topId: parsed.topId,
        bottomId: parsed.bottomId,
        shoeId: parsed.shoeId,
        outerwearId: parsed.outerwearId,
        explanation: parsed.explanation || "A stylish casual outfit",
      };
    }
  } catch (error) {
    console.error("❌ Error getting AI outfit suggestion:", error);
    return null;
  }
}

/**
 * Build prompt for regular outfit (top + bottom + shoes + optional outerwear)
 */
function buildRegularOutfitPrompt(
  wardrobe: {
    tops: ApparelItem[];
    bottoms: ApparelItem[];
    shoes: ApparelItem[];
  },
  lockedItems: {
    top?: ApparelItem;
    bottom?: ApparelItem;
    shoe?: ApparelItem;
    outerwear?: ApparelItem;
  },
  needs: {
    needsTop: boolean;
    needsBottom: boolean;
    needsShoe: boolean;
    needsOuterwear: boolean;
  },
  outerwears: ApparelItem[] = [],
): string {
  let prompt = "Create a stylish matching outfit";

  // Add locked items context
  const lockedParts = [];
  if (lockedItems.top) {
    lockedParts.push(
      `top (LOCKED: ID ${lockedItems.top.id} - ${lockedItems.top.description || lockedItems.top.subcategory} - ${formatColors(lockedItems.top.colors)} ${lockedItems.top.material})`,
    );
  }
  if (lockedItems.outerwear) {
    lockedParts.push(
      `outerwear (LOCKED: ID ${lockedItems.outerwear.id} - ${lockedItems.outerwear.description || lockedItems.outerwear.subcategory} - ${formatColors(lockedItems.outerwear.colors)} ${lockedItems.outerwear.material})`,
    );
  }
  if (lockedItems.bottom) {
    lockedParts.push(
      `bottom (LOCKED: ID ${lockedItems.bottom.id} - ${lockedItems.bottom.description || lockedItems.bottom.subcategory} - ${formatColors(lockedItems.bottom.colors)} ${lockedItems.bottom.material})`,
    );
  }
  if (lockedItems.shoe) {
    lockedParts.push(
      `shoes (LOCKED: ID ${lockedItems.shoe.id} - ${lockedItems.shoe.description || lockedItems.shoe.subcategory} - ${formatColors(lockedItems.shoe.colors)} ${lockedItems.shoe.material})`,
    );
  }

  if (lockedParts.length > 0) {
    prompt += ` that matches the following LOCKED items:\n\n${lockedParts.join("\n")}\n\n`;
    prompt += `You must select items that complement and match well with the locked items above.\n\n`;
  } else {
    prompt += " from these wardrobe items:\n\n";
  }

  // Add available items to shuffle
  if (needs.needsTop) {
    const topsInfo = wardrobe.tops
      .map(
        (item) =>
          `ID ${item.id}: ${item.description || item.subcategory} - ${formatColors(item.colors)} ${item.material} ${item.brand ? `(${item.brand})` : ""}`,
      )
      .join("\n");
    prompt += `AVAILABLE TOPS (select one):\n${topsInfo}\n\n`;
  }

  // Outerwear is optional — include it when the user has outerwear items to shuffle
  if (needs.needsOuterwear && outerwears.length > 0) {
    const outerwearInfo = outerwears
      .map(
        (item) =>
          `ID ${item.id}: ${item.description || item.subcategory} - ${formatColors(item.colors)} ${item.material} ${item.brand ? `(${item.brand})` : ""}`,
      )
      .join("\n");
    prompt += `AVAILABLE OUTERWEAR (optionally select one jacket/coat/blazer that complements the outfit, or omit if it doesn't improve the look):\n${outerwearInfo}\n\n`;
  }

  if (needs.needsBottom) {
    const bottomsInfo = wardrobe.bottoms
      .map(
        (item) =>
          `ID ${item.id}: ${item.description || item.subcategory} - ${formatColors(item.colors)} ${item.material} ${item.brand ? `(${item.brand})` : ""}`,
      )
      .join("\n");
    prompt += `AVAILABLE BOTTOMS (select one):\n${bottomsInfo}\n\n`;
  }

  if (needs.needsShoe) {
    const shoesInfo = wardrobe.shoes
      .map(
        (item) =>
          `ID ${item.id}: ${item.description || item.subcategory} - ${formatColors(item.colors)} ${item.material} ${item.brand ? `(${item.brand})` : ""}`,
      )
      .join("\n");
    prompt += `AVAILABLE SHOES (select one):\n${shoesInfo || "No shoes available"}\n\n`;
  }

  // Build response format
  prompt += "Return your suggestion in this exact JSON format:\n{\n";

  if (needs.needsTop) {
    prompt += '  "topId": <selected top ID>,\n';
  }
  if (needs.needsOuterwear && outerwears.length > 0) {
    prompt +=
      '  "outerwearId": <selected outerwear ID or null if no outerwear suits the outfit>,\n';
  }
  if (needs.needsBottom) {
    prompt += '  "bottomId": <selected bottom ID>,\n';
  }
  if (needs.needsShoe && wardrobe.shoes.length > 0) {
    prompt += '  "shoeId": <selected shoe ID>,\n';
  }

  prompt +=
    '  "explanation": "<brief 1-2 sentence explanation of why this outfit works and matches the locked items>"\n}';

  return prompt;
}

/**
 * Build prompt for dress outfit (dress + shoes)
 */
function buildDressOutfitPrompt(
  wardrobe: {
    dresses: ApparelItem[];
    shoes: ApparelItem[];
  },
  lockedItems: {
    dress?: ApparelItem;
    shoe?: ApparelItem;
  },
  needs: {
    needsDress: boolean;
    needsShoe: boolean;
  },
): string {
  let prompt = "Create a stylish dress outfit";

  // Add locked items context
  const lockedParts = [];
  if (lockedItems.dress) {
    lockedParts.push(
      `dress (LOCKED: ID ${lockedItems.dress.id} - ${lockedItems.dress.description || lockedItems.dress.subcategory} - ${formatColors(lockedItems.dress.colors)} ${lockedItems.dress.material})`,
    );
  }
  if (lockedItems.shoe) {
    lockedParts.push(
      `shoes (LOCKED: ID ${lockedItems.shoe.id} - ${lockedItems.shoe.description || lockedItems.shoe.subcategory} - ${formatColors(lockedItems.shoe.colors)} ${lockedItems.shoe.material})`,
    );
  }

  if (lockedParts.length > 0) {
    prompt += ` that matches the following LOCKED items:\n\n${lockedParts.join("\n")}\n\n`;
    prompt += `You must select items that complement and match well with the locked items above.\n\n`;
  } else {
    prompt += " from these wardrobe items:\n\n";
  }

  // Add available items to shuffle
  if (needs.needsDress) {
    const dressesInfo = wardrobe.dresses
      .map(
        (item) =>
          `ID ${item.id}: ${item.description || item.subcategory} - ${formatColors(item.colors)} ${item.material} ${item.brand ? `(${item.brand})` : ""}`,
      )
      .join("\n");
    prompt += `AVAILABLE DRESSES (select one):\n${dressesInfo}\n\n`;
  }

  if (needs.needsShoe) {
    const shoesInfo = wardrobe.shoes
      .map(
        (item) =>
          `ID ${item.id}: ${item.description || item.subcategory} - ${formatColors(item.colors)} ${item.material} ${item.brand ? `(${item.brand})` : ""}`,
      )
      .join("\n");
    prompt += `AVAILABLE SHOES (select one):\n${shoesInfo || "No shoes available"}\n\n`;
  }

  // Build response format
  prompt += "Return your suggestion in this exact JSON format:\n{\n";

  if (needs.needsDress) {
    prompt += '  "dressId": <selected dress ID>,\n';
  }
  if (needs.needsShoe && wardrobe.shoes.length > 0) {
    prompt += '  "shoeId": <selected shoe ID>,\n';
  }

  prompt +=
    '  "explanation": "<brief 1-2 sentence explanation of why this outfit works and matches the locked items>"\n}';

  return prompt;
}

/**
 * Format colors array into readable string
 */
function formatColors(colors: any): string {
  if (!colors) return "Unknown color";
  if (typeof colors === "string") return colors;
  if (Array.isArray(colors)) return colors.join(", ");
  if (typeof colors === "object") {
    // Handle JSON object with color data
    if (colors.dominant) return colors.dominant;
    return JSON.stringify(colors);
  }
  return "Unknown color";
}
