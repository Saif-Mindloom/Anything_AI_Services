import { Outfit } from "../models/outfit.model";
import {
  addAngleGenerationJob,
  angleGenerationQueue,
} from "../queues/angleGenerationQueue";
import {
  addAccessoryGenerationJob,
  accessoryGenerationQueue,
} from "../queues/accessoryGenerationQueue";
import { pollJobUntilComplete } from "../helpers/jobPoller";
import { authenticateUser } from "./helper/auth";
import { getAccessoriesForOutfit } from "./accessoryGenerationService";
import { removeBackgroundFromBase64 } from "./backgroundRemovalService";
import { centerAndStandardizeImage } from "../helpers/imageUtils";

export const setOutfitVisibilityMutation = async (
  _: any,
  { outfitId }: { outfitId: number },
  context: any,
) => {
  try {
    // Get user from context
    const authHeader = context.req?.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        success: false,
        message: "Authentication required. Please provide a valid token.",
      };
    }

    const outfit = await Outfit.findOne({
      where: { id: outfitId },
    });

    if (!outfit) {
      return {
        success: false,
        message: "Outfit not found",
      };
    }

    // Set visibility to true
    outfit.visible = true;
    await outfit.save();

    return {
      success: true,
      message: "Outfit visibility set to visible",
    };
  } catch (error) {
    console.error("Error setting outfit visibility:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to update outfit visibility",
    };
  }
};

export const generateOutfitAnglesMutation = async (
  _: any,
  {
    outfitId,
    backAngleAvailability,
  }: {
    outfitId: number;
    backAngleAvailability?: {
      top?: boolean;
      bottom?: boolean;
      outerwear?: boolean;
      dress?: boolean;
    };
  },
  context: any,
) => {
  try {
    // Get user from context
    const authHeader = context.req?.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        success: false,
        message: "Authentication required. Please provide a valid token.",
        anglesGenerated: 0,
      };
    }

    const outfit = await Outfit.findOne({
      where: { id: outfitId },
    });

    console.log(`🔍 Outfit lookup result for ID ${outfitId}:`, {
      found: !!outfit,
      primaryImageUrl: outfit?.primaryImageUrl,
      visible: outfit?.visible,
    });

    if (!outfit) {
      console.log(`❌ Outfit ${outfitId} not found in database`);
      return {
        success: false,
        message: "Outfit not found",
        anglesGenerated: 0,
      };
    }

    if (!outfit.primaryImageUrl) {
      console.log(`❌ Outfit ${outfitId} does not have primaryImageUrl`);
      return {
        success: false,
        message: "Outfit does not have an image URL",
        anglesGenerated: 0,
      };
    }

    console.log(`🎬 Queueing angle generation for outfit ${outfitId}...`);
    console.log(`   Using image URL: ${outfit.primaryImageUrl}`);

    // Queue the angle generation job
    const jobId = await addAngleGenerationJob({
      outfitId: Number(outfitId),
      gsUrl: outfit.primaryImageUrl, // Now using HTTP URL
      userId: outfit.userId.toString(),
      skipAngles: ["90"], // Skip 90 degrees as it's the default image
      backAngleAvailability,
    });

    console.log(`✅ Angle generation job queued with ID: ${jobId}`);
    console.log(`⏳ Polling job status every 2 seconds until complete...`);

    // Poll the job until it completes (server-side polling)
    const result = await pollJobUntilComplete(
      angleGenerationQueue,
      jobId as string,
      {
        pollInterval: 2000, // Poll every 2 seconds
        timeout: 300000, // 5 minutes timeout (angle generation can take longer)
      },
    );

    if (result.status === "completed") {
      console.log(`✅ Angle generation completed successfully`);
      return {
        success: true,
        message:
          result.data?.message || "Angle generation completed successfully",
        anglesGenerated: result.data?.anglesGenerated || 0,
        imageUrls: result.data?.imageUrls || {},
        status: "completed",
      };
    } else if (result.status === "failed") {
      console.error(`❌ Angle generation failed: ${result.error}`);
      return {
        success: false,
        message: result.error || "Angle generation failed",
        jobId: jobId as string,
        anglesGenerated: 0,
        status: "failed",
      };
    } else if (result.status === "timeout") {
      console.warn(`⏱️ Angle generation timeout`);
      return {
        success: false,
        message: "Processing timeout. You can check the job status later.",
        jobId: jobId as string,
        anglesGenerated: 0,
        status: "timeout",
      };
    }
  } catch (error) {
    console.error("❌ Error queueing angle generation:", error);
    return {
      success: false,
      message: `Failed to start angle generation: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      anglesGenerated: 0,
    };
  }
};

export const queueOutfitAnglesMutation = async (
  _: any,
  {
    outfitId,
    backAngleAvailability,
  }: {
    outfitId: number;
    backAngleAvailability?: {
      top?: boolean;
      bottom?: boolean;
      outerwear?: boolean;
      dress?: boolean;
    };
  },
  context: any,
) => {
  try {
    const authHeader = context.req?.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        success: false,
        message: "Authentication required. Please provide a valid token.",
        jobId: null,
      };
    }

    const outfit = await Outfit.findOne({
      where: { id: outfitId },
    });

    if (!outfit) {
      return {
        success: false,
        message: "Outfit not found",
        jobId: null,
      };
    }

    if (!outfit.primaryImageUrl) {
      return {
        success: false,
        message: "Outfit does not have an image URL",
        jobId: null,
      };
    }

    console.log(
      `🎬 Queueing angle generation (fire-and-forget) for outfit ${outfitId}...`,
    );

    const jobId = await addAngleGenerationJob({
      outfitId: Number(outfitId),
      gsUrl: outfit.primaryImageUrl,
      userId: outfit.userId.toString(),
      skipAngles: ["90"],
      backAngleAvailability,
    });

    console.log(`✅ Angle generation job queued with ID: ${jobId}`);

    return {
      success: true,
      message:
        "Angle generation queued successfully. It will process in the background.",
      jobId: jobId as string,
    };
  } catch (error) {
    console.error("❌ Error queueing angle generation:", error);
    return {
      success: false,
      message: `Failed to queue angle generation: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      jobId: null,
    };
  }
};

export const getOutfitDetailsQuery = async (
  _: any,
  { outfitId }: { outfitId: number },
  context: any,
) => {
  try {
    // Get user from context
    const authHeader = context.req?.headers?.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return {
        success: false,
        message: "Authentication required. Please provide a valid token.",
        outfit: null,
      };
    }

    const outfit = await Outfit.findOne({
      where: { id: outfitId },
    });

    if (!outfit) {
      return {
        success: false,
        message: "Outfit not found",
        outfit: null,
      };
    }

    // Apply dress/top/bottom mutual exclusivity for frontend consistency
    let finalTopId = outfit.topId;
    let finalBottomId = outfit.bottomId;
    let finalDressId = outfit.dressId;

    if (finalDressId && finalDressId > 0) {
      // If dress is present, return 0 for top and bottom
      finalTopId = 0;
      finalBottomId = 0;
    } else if (
      (finalTopId && finalTopId > 0) ||
      (finalBottomId && finalBottomId > 0)
    ) {
      // If top or bottom is present, return 0 for dress
      finalDressId = 0;
    }

    return {
      success: true,
      message: "Outfit details retrieved successfully",
      outfit: {
        id: outfit.id,
        topId: finalTopId,
        bottomId: finalBottomId,
        shoeId: outfit.shoeId,
        dressId: finalDressId,
        accessoryIds: outfit.accessoryIds || [],
        primaryImageUrl: outfit.primaryImageUrl || null,
        imageList: outfit.imageList ? JSON.stringify(outfit.imageList) : null,
        rating: outfit.rating || null,
        poseLeft: outfit.poseLeft || null,
        poseRight: outfit.poseRight || null,
        hasAccessories: outfit.hasAccessories,
        outfitSummary: outfit.outfitSummary || null,
        accessoriesSummary: outfit.accessoriesSummary || null,
      },
    };
  } catch (error) {
    console.error("Error fetching outfit details:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch outfit details",
      outfit: null,
    };
  }
};

export const getFavouritedOutfitsQuery = async (
  _: any,
  args: any,
  context: any,
) => {
  try {
    // Authenticate user
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
        outfits: [],
      };
    }

    const user = authResult.user;

    // Fetch favorited outfits for the user
    const outfits = await Outfit.findAll({
      where: {
        userId: user.userId,
        favourite: true,
      },
      attributes: ["id", "primaryImageUrl"],
      order: [["updatedAt", "DESC"]],
    });

    return {
      success: true,
      message: `Found ${outfits.length} favorited outfit(s)`,
      outfits: outfits.map((outfit) => ({
        id: outfit.id,
        primaryImageUrl: outfit.primaryImageUrl || null,
      })),
    };
  } catch (error) {
    console.error("Error fetching favorited outfits:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch favorited outfits",
      outfits: [],
    };
  }
};

export const toggleOutfitFavouriteMutation = async (
  _: any,
  { outfitId }: { outfitId: number },
  context: any,
) => {
  try {
    // Authenticate user
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
        isFavourite: false,
      };
    }

    const user = authResult.user;

    // Find the outfit and verify ownership
    const outfit = await Outfit.findOne({
      where: {
        id: outfitId,
        userId: user.userId,
      },
    });

    if (!outfit) {
      return {
        success: false,
        message: "Outfit not found or you don't have permission to modify it",
        isFavourite: false,
      };
    }

    // Toggle the favourite status
    outfit.favourite = !outfit.favourite;
    await outfit.save();

    return {
      success: true,
      message: outfit.favourite
        ? "Outfit added to favourites"
        : "Outfit removed from favourites",
      isFavourite: outfit.favourite,
    };
  } catch (error) {
    console.error("Error toggling outfit favourite status:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to toggle outfit favourite status",
      isFavourite: false,
    };
  }
};

export const getVisibleOutfitsQuery = async (
  _: any,
  args: any,
  context: any,
) => {
  try {
    // Authenticate user
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
        outfits: [],
      };
    }

    const user = authResult.user;

    // Fetch visible outfits for the user (similar to saved looks in home page)
    const visibleOutfits = await Outfit.findAll({
      where: {
        userId: user.userId,
        visible: true,
      },
      order: [["updatedAt", "DESC"]],
    });

    // Filter outfits that have primary image URLs and map to IdUrlPair format
    const outfits = visibleOutfits
      .filter((outfit) => outfit.primaryImageUrl) // Only include outfits with images
      .map((outfit) => ({
        id: outfit.id,
        url: outfit.primaryImageUrl!,
      }));

    return {
      success: true,
      message: `Found ${outfits.length} visible outfit(s)`,
      outfits,
    };
  } catch (error) {
    console.error("Error fetching visible outfits:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch visible outfits",
      outfits: [],
    };
  }
};
/**
 * MCP-compatible version of getOutfitDetails that accepts userId explicitly
 * Used by MCP tools which don't have JWT context
 */
export const getOutfitDetailsForMCP = async (
  _: any,
  { outfitId, userId }: { outfitId: number; userId: number },
  context: any,
) => {
  try {
    const outfit = await Outfit.findOne({
      where: { id: outfitId, userId: userId },
    });

    if (!outfit) {
      return {
        success: false,
        message: `Outfit ${outfitId} not found for user ${userId}`,
        outfit: null,
      };
    }

    // Fetch accessories if they exist
    let accessories = [];
    if (outfit.hasAccessories) {
      const accessoryList = await getAccessoriesForOutfit(outfitId);
      accessories = accessoryList.map((acc) => ({
        id: acc.id,
        outfitId: acc.outfitId,
        accessoryType: acc.accessoryType,
        description: acc.description || null,
        imageUrl: acc.imageUrl || null,
        gsUtil: acc.gsUtil || null,
        status: acc.status,
        createdAt: acc.createdAt?.toISOString() || null,
        updatedAt: acc.updatedAt?.toISOString() || null,
      }));
    }

    return {
      success: true,
      message: "Outfit details retrieved successfully",
      outfit: {
        id: outfit.id,
        topId: outfit.topId,
        bottomId: outfit.bottomId,
        shoeId: outfit.shoeId,
        dressId: outfit.dressId,
        accessoryIds: outfit.accessoryIds || [],
        primaryImageUrl: outfit.primaryImageUrl || null,
        imageList: outfit.imageList ? JSON.stringify(outfit.imageList) : null,
        rating: outfit.rating || null,
        poseLeft: outfit.poseLeft || null,
        poseRight: outfit.poseRight || null,
        hasAccessories: outfit.hasAccessories,
        outfitSummary: outfit.outfitSummary || null,
        accessoriesSummary: outfit.accessoriesSummary || null,
        accessories: accessories,
      },
    };
  } catch (error) {
    console.error("Error fetching outfit details for MCP:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to fetch outfit details",
      outfit: null,
    };
  }
};

/**
 * Generate accessories for an outfit
 */
export const generateAccessoriesMutation = async (
  _: any,
  { outfitId }: { outfitId: number },
  context: any,
) => {
  try {
    // Authenticate user
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      return {
        success: false,
        message: authResult.error,
        jobId: null,
      };
    }

    const user = authResult.user;

    console.log(
      `🎨 Adding accessory generation job for outfit ${outfitId} by user ${user.userId}`,
    );

    // Add job to queue instead of running synchronously
    const jobId = await addAccessoryGenerationJob({
      outfitId: Number(outfitId),
      userId: Number(user.userId),
    });

    console.log(`✅ Accessory generation job queued with ID: ${jobId}`);

    return {
      success: true,
      message: `Accessory generation job started. Use jobId to track progress.`,
      jobId: jobId.toString(),
    };
  } catch (error) {
    console.error("❌ Error queueing accessory generation job:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to queue accessory generation job",
      jobId: null,
    };
  }
};

/**
 * Get accessories for an outfit
 */
export const getOutfitAccessoriesQuery = async (
  _: any,
  { outfitId }: { outfitId: number },
  context: any,
) => {
  try {
    console.log(
      `🎯 getOutfitAccessoriesQuery called with outfitId: ${outfitId}`,
    );

    // Authenticate user
    const authResult = await authenticateUser(context);
    if (authResult.error) {
      console.log(`❌ Auth failed: ${authResult.error}`);
      return {
        success: false,
        message: authResult.error,
        accessories: [],
      };
    }

    console.log(`✅ User authenticated: ${authResult.user.userId}`);

    // Get accessories
    const accessories = await getAccessoriesForOutfit(outfitId);

    console.log(`📊 Returning ${accessories.length} accessories`);

    return {
      success: true,
      message: `Found ${accessories.length} accessorie(s)`,
      accessories: accessories.map((acc) => ({
        id: acc.id,
        outfitId: Number(acc.outfitId),
        accessoryType: acc.accessoryType,
        description: acc.description || null,
        imageUrl: acc.imageUrl || null,
        gsUtil: acc.gsUtil || null,
        status: acc.status,
        createdAt: acc.createdAt?.toISOString() || null,
        updatedAt: acc.updatedAt?.toISOString() || null,
      })),
    };
  } catch (error) {
    console.error("❌ Error fetching accessories:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Failed to fetch accessories",
      accessories: [],
    };
  }
};

/**
 * Generate category-specific instructions for each accessory type
 */
const generateAccessoryInstructions = (
  accessoryType: string,
  imagePosition: string,
): string => {
  const type = accessoryType.toLowerCase();

  if (type === "headwear") {
    return `
**ACCESSORY TYPE: HEADWEAR**

**YOUR TASK:**
The ${imagePosition} image shows HEADWEAR (hat/cap/beanie/headband). You must add this headwear to the person.

**🚨 CRITICAL - PRESERVE EVERYTHING EXCEPT HEAD AREA:**
- Person's FACE must remain IDENTICAL (all facial features, expression)
- Person's CLOTHING must remain IDENTICAL (do NOT change outfit)
- Person's POSE must remain IDENTICAL (same stance, arms, legs)
- Person's BODY must remain IDENTICAL (same proportions)
- BACKGROUND must remain IDENTICAL

**WHAT TO DO:**
1. Identify the headwear design, color, and style from the ${imagePosition} image
2. Place the headwear ON TOP OF the person's head
3. The headwear should sit naturally on the head, conforming to the head shape
4. Maintain realistic shadows where headwear touches the head
5. Hair may be partially covered by the headwear (natural interaction)
6. The headwear is WORN, not floating or separate

**FORBIDDEN:**
✗ Changing the person's face, body, or clothing
✗ Changing the person's pose or position
✗ Showing the headwear as a separate object
✗ Altering the background`;
  } else if (type === "eyewear") {
    return `
**ACCESSORY TYPE: EYEWEAR**

**YOUR TASK:**
The ${imagePosition} image shows EYEWEAR (glasses/sunglasses). You must add these to the person.

**🚨 CRITICAL - PRESERVE EVERYTHING EXCEPT EYE AREA:**
- Person's FACE must remain IDENTICAL (facial structure, expression)
- Person's CLOTHING must remain IDENTICAL (do NOT change outfit)
- Person's POSE must remain IDENTICAL (same stance, head position)
- Person's BODY must remain IDENTICAL
- BACKGROUND must remain IDENTICAL

**WHAT TO DO:**
1. Identify the eyewear design, color, and style from the ${imagePosition} image
2. Place the eyewear ON the person's face, resting on the nose bridge
3. The eyewear should align with the person's eyes naturally
4. Temples (arms) should extend to the ears
5. Maintain realistic shadows on the face from the frames
6. The eyewear is WORN, not floating in front of the face

**FORBIDDEN:**
✗ Changing the person's face shape or features
✗ Changing the person's clothing or body
✗ Showing the eyewear as a separate object`;
  } else if (type === "necklace" || type === "chain") {
    return `
**ACCESSORY TYPE: NECKLACE/CHAIN**

**YOUR TASK:**
The ${imagePosition} image shows a NECKLACE/CHAIN. You must add this to the person.

**🚨 CRITICAL - PRESERVE EVERYTHING EXCEPT NECK AREA:**
- Person's FACE must remain IDENTICAL
- Person's CLOTHING must remain IDENTICAL (do NOT change outfit)
- Person's POSE must remain IDENTICAL
- Person's BODY must remain IDENTICAL
- BACKGROUND must remain IDENTICAL

**WHAT TO DO:**
1. Identify the necklace/chain design, color, length from the ${imagePosition} image
2. Place the necklace AROUND the person's neck
3. The necklace should hang naturally from the neck, resting on the chest
4. Follow the body contours (collarbone, chest)
5. Maintain realistic shadows cast by the necklace on clothing/skin
6. The necklace should layer over the existing clothing naturally
7. The necklace is WORN, not floating

**FORBIDDEN:**
✗ Changing the person's clothing underneath
✗ Changing the person's face or body
✗ Showing the necklace as a separate object`;
  } else if (type === "earing" || type === "earring") {
    return `
**ACCESSORY TYPE: EARRINGS**

**YOUR TASK:**
The ${imagePosition} image shows EARRINGS. You must add these to the person.

**🚨 CRITICAL - PRESERVE EVERYTHING EXCEPT EAR AREA:**
- Person's FACE must remain IDENTICAL
- Person's HAIR must remain IDENTICAL
- Person's CLOTHING must remain IDENTICAL (do NOT change outfit)
- Person's POSE must remain IDENTICAL
- BACKGROUND must remain IDENTICAL

**WHAT TO DO:**
1. Identify the earring design, color, size from the ${imagePosition} image
2. Place earrings ON both ears (attached to earlobes)
3. Earrings should be visible on both sides of the face
4. They should hang naturally from the earlobes
5. Maintain realistic interaction with hair (if hair partially covers them, that's natural)
6. The earrings are WORN, not floating near the ears

**FORBIDDEN:**
✗ Changing the person's face, hair, or clothing
✗ Showing earrings as separate objects`;
  } else if (type === "watch") {
    return `
**ACCESSORY TYPE: WATCH**

**YOUR TASK:**
The ${imagePosition} image shows a WATCH. You must add this to the person.

**🚨 CRITICAL - PRESERVE EVERYTHING EXCEPT WRIST AREA:**
- Person's FACE must remain IDENTICAL
- Person's CLOTHING must remain IDENTICAL (do NOT change outfit)
- Person's POSE must remain IDENTICAL
- Person's BODY must remain IDENTICAL
- BACKGROUND must remain IDENTICAL

**WHAT TO DO:**
1. Identify the watch design, color, band style from the ${imagePosition} image
2. Place the watch AROUND one wrist (typically left wrist)
3. The watch should wrap around the wrist naturally
4. Watch face should be visible on top of the wrist
5. Band should conform to wrist shape
6. Maintain realistic shadows from the watch on skin
7. The watch is WORN, not floating near the wrist

**FORBIDDEN:**
✗ Changing the person's clothing or body
✗ Showing the watch as a separate object`;
  } else if (type === "bracelet") {
    return `
**ACCESSORY TYPE: BRACELET**

**YOUR TASK:**
The ${imagePosition} image shows a BRACELET. You must add this to the person.

**🚨 CRITICAL - PRESERVE EVERYTHING EXCEPT WRIST/FOREARM AREA:**
- Person's FACE must remain IDENTICAL
- Person's CLOTHING must remain IDENTICAL (do NOT change outfit)
- Person's POSE must remain IDENTICAL
- Person's BODY must remain IDENTICAL
- BACKGROUND must remain IDENTICAL

**WHAT TO DO:**
1. Identify the bracelet design, color, style from the ${imagePosition} image
2. Place the bracelet AROUND the wrist or forearm
3. The bracelet should wrap naturally around the arm
4. Maintain realistic positioning (hanging loosely or fitted depending on style)
5. Cast shadows on the skin from the bracelet
6. The bracelet is WORN, not floating

**FORBIDDEN:**
✗ Changing the person's clothing or body
✗ Showing the bracelet as a separate object`;
  } else if (type === "ring") {
    return `
**ACCESSORY TYPE: RING**

**YOUR TASK:**
The ${imagePosition} image shows a RING. You must add this to the person.

**🚨 CRITICAL - PRESERVE EVERYTHING EXCEPT FINGER AREA:**
- Person's FACE must remain IDENTICAL
- Person's CLOTHING must remain IDENTICAL (do NOT change outfit)
- Person's POSE must remain IDENTICAL
- Person's BODY must remain IDENTICAL
- BACKGROUND must remain IDENTICAL

**WHAT TO DO:**
1. Identify the ring design, color, style from the ${imagePosition} image
2. Place the ring ON one or more fingers (typically ring finger or index finger)
3. The ring should wrap around the finger naturally
4. Maintain realistic sizing (fitted to finger)
5. Cast subtle shadows on the hand
6. The ring is WORN, not floating near the hand

**FORBIDDEN:**
✗ Changing the person's clothing or body
✗ Showing the ring as a separate object`;
  } else if (type === "belt") {
    return `
**ACCESSORY TYPE: BELT**

**YOUR TASK:**
The ${imagePosition} image shows a BELT. You must add this to the person.

**🚨 CRITICAL - PRESERVE EVERYTHING EXCEPT WAIST AREA:**
- Person's FACE must remain IDENTICAL
- Person's CLOTHING must remain IDENTICAL (do NOT change the outfit, only add belt)
- Person's POSE must remain IDENTICAL
- Person's BODY must remain IDENTICAL
- BACKGROUND must remain IDENTICAL

**WHAT TO DO:**
1. Identify the belt design, color, buckle style from the ${imagePosition} image
2. Place the belt AROUND the waist, over the existing clothing
3. The belt should follow the waistline naturally
4. Buckle should be centered at the front
5. Belt should wrap around the torso conforming to body shape
6. Maintain realistic shadows and depth where belt sits on clothing
7. The belt is WORN over the clothing, not floating

**FORBIDDEN:**
✗ Changing the person's clothing underneath the belt
✗ Changing the person's body or face
✗ Showing the belt as a separate object`;
  } else if (type === "scarf") {
    return `
**ACCESSORY TYPE: SCARF**

**YOUR TASK:**
The ${imagePosition} image shows a SCARF. You must add this to the person.

**🚨 CRITICAL - PRESERVE EVERYTHING EXCEPT NECK/SHOULDER AREA:**
- Person's FACE must remain IDENTICAL
- Person's CLOTHING must remain IDENTICAL (underneath the scarf)
- Person's POSE must remain IDENTICAL
- Person's BODY must remain IDENTICAL
- BACKGROUND must remain IDENTICAL

**WHAT TO DO:**
1. Identify the scarf design, color, pattern from the ${imagePosition} image
2. Place the scarf AROUND the neck or draped over shoulders
3. The scarf should hang/drape naturally with realistic fabric flow
4. Follow natural draping physics (folds, curves)
5. Maintain realistic layering over existing clothing
6. Cast shadows from the scarf on clothing/skin
7. The scarf is WORN, not floating

**FORBIDDEN:**
✗ Changing the person's clothing underneath
✗ Changing the person's face or body
✗ Showing the scarf as a separate object`;
  } else {
    // Generic fallback
    return `
**ACCESSORY TYPE: ${accessoryType.toUpperCase()}**

**YOUR TASK:**
The ${imagePosition} image shows a ${accessoryType.toUpperCase()}. You must add this accessory to the person.

**🚨 CRITICAL - PRESERVE EVERYTHING EXCEPT ACCESSORY PLACEMENT AREA:**
- Person's FACE must remain IDENTICAL
- Person's CLOTHING must remain IDENTICAL (do NOT change outfit)
- Person's POSE must remain IDENTICAL
- Person's BODY must remain IDENTICAL
- BACKGROUND must remain IDENTICAL

**WHAT TO DO:**
1. Identify the accessory design, color, style from the ${imagePosition} image
2. Place the accessory appropriately on the person
3. The accessory should be naturally positioned and worn
4. Maintain realistic shadows and depth
5. The accessory is WORN, not floating or separate

**FORBIDDEN:**
✗ Changing the person's clothing, face, or body
✗ Showing the accessory as a separate object`;
  }
};

/**
 * Test mutation to generate a composite image using Vertex AI Imagen 3 Editor
 * Uses mask-based image editing to ADD accessories while preserving the person's identity
 * NO AUTH REQUIRED - This is for testing only
 */
export const testGenerateOutfitCompositeMutation = async (
  _: any,
  { outfitId }: { outfitId: number },
  context: any,
) => {
  try {
    console.log(
      `🎨 [Vertex AI] Starting composite generation for outfit ${outfitId}`,
    );

    // 1. Fetch the outfit
    const outfit = await Outfit.findOne({
      where: { id: outfitId },
    });

    if (!outfit) {
      return {
        success: false,
        message: `Outfit ${outfitId} not found`,
        imageUrl: null,
      };
    }

    if (!outfit.primaryImageUrl) {
      return {
        success: false,
        message: `Outfit ${outfitId} does not have a primary image`,
        imageUrl: null,
      };
    }

    console.log(`📸 Outfit primary image: ${outfit.primaryImageUrl}`);

    // 2. Fetch accessories for this outfit
    const accessories = await getAccessoriesForOutfit(outfitId);

    if (accessories.length === 0) {
      return {
        success: false,
        message: `Outfit ${outfitId} has no accessories`,
        imageUrl: null,
      };
    }

    console.log(
      `👜 Found ${accessories.length} accessories:`,
      accessories.map((a) => ({
        type: a.accessoryType,
        hasImage: !!a.imageUrl,
        description: a.description,
      })),
    );

    // 3. Filter accessories that have images
    const accessoriesWithImages = accessories.filter((a) => a.imageUrl);

    if (accessoriesWithImages.length === 0) {
      return {
        success: false,
        message: `None of the ${accessories.length} accessories have images`,
        imageUrl: null,
      };
    }

    console.log(`✅ ${accessoriesWithImages.length} accessories have images`);

    // 4. Initialize Vertex AI client
    const { VertexAI } = await import("@google-cloud/vertexai");

    const projectId =
      process.env.GOOGLE_CLOUD_PROJECT || "project-51e11a25-2e77-4b6b-a91";
    const location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";

    console.log(
      `🔧 Initializing Vertex AI (Project: ${projectId}, Location: ${location})`,
    );

    const vertexAI = new VertexAI({
      project: projectId,
      location: location,
    });

    // 5. Download outfit image and convert to base64
    const downloadImageAsBuffer = async (url: string): Promise<Buffer> => {
      const response = await fetch(url);
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    };

    console.log(`📥 Downloading outfit image...`);
    const outfitImageBuffer = await downloadImageAsBuffer(
      outfit.primaryImageUrl,
    );
    const outfitImageBase64 = outfitImageBuffer.toString("base64");

    // 6. Process accessories one by one using Vertex AI Imagen Editor
    console.log(
      `🔄 Processing ${accessoriesWithImages.length} accessories using Imagen 3 Editor...`,
    );

    let currentImageBuffer = outfitImageBuffer;
    let currentImageBase64 = outfitImageBase64;

    for (let i = 0; i < accessoriesWithImages.length; i++) {
      const accessory = accessoriesWithImages[i];
      console.log(
        `\n📌 Processing accessory ${i + 1}/${accessoriesWithImages.length}: ${accessory.accessoryType}`,
      );

      // Download accessory reference image
      console.log(`   📥 Downloading accessory image...`);
      const accessoryBuffer = await downloadImageAsBuffer(accessory.imageUrl!);
      const accessoryBase64 = accessoryBuffer.toString("base64");

      // Build editing prompt for this specific accessory
      const editPrompt = buildAccessoryEditPrompt(
        accessory.accessoryType,
        accessory.description || "",
      );

      console.log(`   🎨 Editing image with Imagen 3 Editor...`);
      console.log(`   📝 Prompt: ${editPrompt.substring(0, 100)}...`);

      // Call Vertex AI Imagen 3 Editor with retry logic
      const maxRetries = 3;
      let editedImageBuffer: Buffer | null = null;

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`   🔄 Attempt ${attempt}/${maxRetries}...`);

          const generativeModel = vertexAI.getGenerativeModel({
            model: "imagen-3.0-generate-001",
          });

          // Build the prompt text
          const promptText = `${editPrompt}\n\nMain image to edit (add accessory to this person):`;

          // Combine text and images - use 'as any' to bypass strict type checking
          const request: any = {
            contents: [
              {
                role: "user",
                parts: [
                  { text: promptText },
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: currentImageBase64,
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
              },
            ],
          };

          const response = await generativeModel.generateContent(request);

          // Extract edited image from response
          if (response?.response?.candidates?.[0]?.content?.parts) {
            for (const part of response.response.candidates[0].content.parts) {
              if (part.inlineData?.data) {
                editedImageBuffer = Buffer.from(part.inlineData.data, "base64");
                console.log(`   ✅ Successfully edited image`);
                break;
              }
            }
          }

          if (editedImageBuffer) {
            break;
          } else {
            console.log(`   ⚠️ No image in response, retrying...`);
          }
        } catch (apiError: any) {
          console.log(
            `   ❌ API error: ${apiError?.message || "Unknown error"}`,
          );

          if (attempt === maxRetries) {
            throw new Error(
              `Failed to edit image for ${accessory.accessoryType} after ${maxRetries} attempts: ${apiError?.message}`,
            );
          }

          // Exponential backoff
          const delayMs = 6000 * Math.pow(2, attempt - 1);
          console.log(`   ⏳ Waiting ${delayMs / 1000}s before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      if (!editedImageBuffer) {
        throw new Error(
          `Failed to edit image for ${accessory.accessoryType}: No image returned from Vertex AI`,
        );
      }

      // Update current image for next iteration
      currentImageBuffer = editedImageBuffer;
      currentImageBase64 = editedImageBuffer.toString("base64");

      console.log(
        `   ✅ Accessory ${i + 1}/${accessoriesWithImages.length} added successfully`,
      );
    }

    console.log(
      `\n✅ All ${accessoriesWithImages.length} accessories processed`,
    );

    // 7. Apply post-processing: background removal
    console.log(`🔄 Applying background removal...`);
    try {
      const base64Image = `data:image/png;base64,${currentImageBase64}`;
      console.log(
        `   Sending to remove.bg (size: ${Math.round(currentImageBuffer.length / 1024)}KB)...`,
      );
      const resultBase64 = await removeBackgroundFromBase64(base64Image, {
        background: "transparent",
      });
      const base64Data = resultBase64.split(",")[1] || resultBase64;
      currentImageBuffer = Buffer.from(base64Data, "base64");
      currentImageBase64 = currentImageBuffer.toString("base64");
      console.log(
        `   ✅ Background removed (new size: ${Math.round(currentImageBuffer.length / 1024)}KB)`,
      );
    } catch (bgError: any) {
      console.log(
        `   ⚠️ Background removal failed: ${bgError.message}, using original`,
      );
    }

    // 8. Apply post-processing: centering and standardization
    console.log(`🔄 Centering and standardizing image...`);
    try {
      currentImageBuffer = await centerAndStandardizeImage(currentImageBuffer);
      console.log(`   ✅ Image centered and standardized`);
    } catch (centerError: any) {
      console.log(
        `   ⚠️ Centering failed: ${centerError.message}, using original`,
      );
    }

    // 9. Save the final composite image locally
    const fs = await import("fs/promises");
    const path = await import("path");

    const timestamp = Date.now();
    const filename = `outfit-${outfitId}-composite-vertex-${timestamp}.png`;
    const outputDir = path.join(
      __dirname,
      "../../generated-images/outfit-composites",
    );
    const outputPath = path.join(outputDir, filename);

    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(outputPath, currentImageBuffer);

    console.log(`💾 Saved composite image to: ${outputPath}`);

    return {
      success: true,
      message: `Generated composite image with ${accessoriesWithImages.length} accessories using Vertex AI Imagen 3 Editor. Saved to: ${filename}`,
      imageUrl: `/generated-images/outfit-composites/${filename}`,
    };
  } catch (error) {
    console.error("❌ Error generating composite:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to generate composite image",
      imageUrl: null,
    };
  }
};

// ============================================================
// Helper: Get body placement instructions for an accessory category
// ============================================================
const getAccessoryPlacementInstructions = (category: string): string => {
  const cat = category.toLowerCase();
  if (cat === "headwear") {
    return "on top of the person's head. The hat/cap must sit firmly on the skull, pressing down the hair slightly beneath it. The brim follows the head's curvature. Add a subtle cast shadow from the brim onto the forehead.";
  }
  if (cat === "eyewear") {
    return "on the person's face. The nose pads rest on the nose bridge, the frame sits level across both eyes, and the arms extend to the ears. The lenses must reflect the ambient light realistically. The frame casts a thin shadow on the cheeks and nose.";
  }
  if (cat === "necklace" || cat === "chain") {
    return "around the person's neck. The chain drapes in a natural U-curve following gravity, resting against the skin and over any clothing at the collarbone. The pendant, if any, hangs centred on the chest. Add subtle contact shadows where the chain rests on skin or fabric.";
  }
  if (cat === "scarf") {
    return "around the neck or draped over the shoulders. The fabric must fold and drape with realistic weight — show creases, gravity-driven flow, and natural bunching at the neck. The scarf layers over the existing clothing.";
  }
  if (cat === "ring") {
    return "on one or more fingers. The ring band wraps fully around the cylindrical finger — show the front arc clearly, with the sides curving away. The ring must press slightly into the skin on both sides of the finger. Render correct metallic or gemstone highlights.";
  }
  if (cat === "bracelet") {
    return "around the wrist as a fully 3D object. CRITICAL 3D RENDERING REQUIREMENTS: (1) The bracelet is a rigid or flexible band that wraps COMPLETELY around the cylindrical wrist — show the front arc, the sides curving away, and the back portion hidden behind the wrist (occluded). (2) The band must conform to the wrist's cylindrical shape — it is NOT flat. (3) Add a contact shadow on the skin just below the bracelet edge where it presses against the wrist. (4) Render the material realistically: leather = matte surface with subtle grain; metal = specular highlights on the curved surface; beads/stones = individual light reflections. (5) The bracelet should sit snugly with slight skin compression visible at the edges. It should look indistinguishable from a real photograph.";
  }
  if (cat === "watch") {
    return "around the left wrist as a fully 3D object. CRITICAL 3D RENDERING REQUIREMENTS: (1) The watch strap wraps completely around the cylindrical wrist — front strap, watch case, and back strap all follow the wrist's curve. (2) The watch case sits on top of the wrist, face angled slightly toward the viewer. (3) The strap presses into the skin slightly on both sides. (4) Add a contact shadow beneath the watch case on the wrist skin. (5) Render metallic case with correct specular highlights; the glass face has a subtle reflection. (6) It must look like a real photograph, not a digital composite.";
  }
  if (cat === "belt") {
    return "around the waist, threaded through the belt loops of the trousers/pants. The belt wraps the waistband following the body's contour. The buckle is centred at the front. The leather or fabric has realistic texture and slight curvature following the body.";
  }
  if (cat === "bag") {
    return "carried naturally — either held in one hand (handle gripped, bag hanging at side) or worn over a shoulder (strap across the shoulder/chest, bag resting at the hip). The bag must have realistic weight — show slight deformation of the strap under tension and the bag's natural sag.";
  }
  if (cat === "earings" || cat === "earring") {
    return "on both ears. The earring post goes through the earlobe, with the decorative part hanging or sitting just below/on the lobe. Both ears must have matching earrings. Add tiny contact shadows where the earring rests against the neck or ear.";
  }
  return "on the appropriate body location, rendered as a fully 3D photorealistic object with proper shadows, highlights, and contact points against the skin";
};

// ============================================================
// Test mutation: Accessory Virtual Try-On (Gemini, no auth, save locally)
// ============================================================
interface TestAccessoryTryOnArgs {
  modelUrl: string;
  accessory1Url?: string;
  accessory1Category?: string;
  accessory2Url?: string;
  accessory2Category?: string;
  accessory3Url?: string;
  accessory3Category?: string;
}

export const testAccessoryTryOnMutation = async (
  _: any,
  args: TestAccessoryTryOnArgs,
  _context: any,
) => {
  const {
    modelUrl,
    accessory1Url,
    accessory1Category,
    accessory2Url,
    accessory2Category,
    accessory3Url,
    accessory3Category,
  } = args;

  try {
    // Build list of provided accessories
    const accessoryItems: Array<{ url: string; category: string }> = [];
    if (accessory1Url && accessory1Category) {
      accessoryItems.push({ url: accessory1Url, category: accessory1Category });
    }
    if (accessory2Url && accessory2Category) {
      accessoryItems.push({ url: accessory2Url, category: accessory2Category });
    }
    if (accessory3Url && accessory3Category) {
      accessoryItems.push({ url: accessory3Url, category: accessory3Category });
    }

    if (accessoryItems.length === 0) {
      return {
        success: false,
        message: "At least one accessory (url + category) must be provided.",
        imageUrl: null,
      };
    }

    console.log(
      `🎨 [Test Accessory Try-On] Starting with ${accessoryItems.length} accessor(ies)`,
    );
    accessoryItems.forEach((a, i) =>
      console.log(`   #${i + 1}: ${a.category} → ${a.url}`),
    );

    // Helper: download image URL → base64 string
    const downloadToBase64 = async (url: string): Promise<string> => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(
          `Failed to download image from ${url}: ${res.statusText}`,
        );
      }
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.toString("base64");
    };

    const sharp = (await import("sharp")).default;

    // -------------------------------------------------------
    // 1. Download all accessory images
    // -------------------------------------------------------
    const accessoryBuffers: Array<{ buffer: Buffer; category: string }> = [];
    for (const item of accessoryItems) {
      const base64 = await downloadToBase64(item.url);
      accessoryBuffers.push({
        buffer: Buffer.from(base64, "base64"),
        category: item.category,
      });
      console.log(`   ✓ Downloaded ${item.category}`);
    }

    // -------------------------------------------------------
    // 2. Build composite image (same 2-column grid as batch apparel try-on)
    // -------------------------------------------------------
    const uniformSize = 400;
    const itemsPerRow = 2;
    const padding = 40;
    const rows = Math.ceil(accessoryBuffers.length / itemsPerRow);
    const gridWidth = uniformSize * itemsPerRow + padding * (itemsPerRow + 1);
    const gridHeight = uniformSize * rows + padding * (rows + 1);

    const resizedBuffers = await Promise.all(
      accessoryBuffers.map(async ({ buffer, category }) => {
        const resized = await sharp(buffer)
          .resize(uniformSize, uniformSize, {
            fit: "contain",
            background: { r: 255, g: 255, b: 255, alpha: 0 },
          })
          .png()
          .toBuffer();
        return { buffer: resized, category };
      }),
    );

    const compositeOps = resizedBuffers.map(({ buffer }, i) => {
      const row = Math.floor(i / itemsPerRow);
      const col = i % itemsPerRow;
      return {
        input: buffer,
        left: padding + col * (uniformSize + padding),
        top: padding + row * (uniformSize + padding),
      };
    });

    const compositeBuffer = await sharp({
      create: {
        width: gridWidth,
        height: gridHeight,
        channels: 4,
        background: { r: 245, g: 245, b: 245, alpha: 1 },
      },
    })
      .composite(compositeOps)
      .png()
      .toBuffer();

    const compositeBase64 = compositeBuffer.toString("base64");
    console.log(
      `   ✓ Composite image created (${gridWidth}x${gridHeight}, ${accessoryBuffers.length} items)`,
    );

    // -------------------------------------------------------
    // 3. Download model image
    // -------------------------------------------------------
    const modelBase64 = await downloadToBase64(modelUrl);
    console.log(`   ✓ Downloaded model image`);

    // -------------------------------------------------------
    // 4. Build prompt
    // -------------------------------------------------------
    // Describe what's in each grid cell
    const gridDescriptions = accessoryBuffers.map(({ category }, i) => {
      const row = Math.floor(i / itemsPerRow) + 1;
      const col = (i % itemsPerRow) + 1;
      const placement = getAccessoryPlacementInstructions(category);
      return `   • Grid cell Row ${row}, Col ${col}: ${category.toUpperCase()} → Place ${placement}`;
    });

    const accessoryListText = accessoryItems
      .map((a, i) => `${i + 1}. ${a.category.toUpperCase()}`)
      .join(", ");

    const prompt = `You are a world-class virtual try-on AI with expert knowledge in photorealistic 3D accessory rendering. Your task is to create a studio-quality fashion photograph of the person from the FIRST image, now wearing the accessories shown in the SECOND image.

**FUNDAMENTAL PRINCIPLE:**
Every accessory must be rendered as a genuine 3D physical object worn on the body — with correct perspective, curvature, occlusion, contact shadows, and material properties. The result must be indistinguishable from a real photograph taken in a professional studio. There must be NO "pasted on" or flat appearance to any accessory.

**CRITICAL — MUST PRESERVE EXACTLY:**
1. **Person's Identity:** Face, hair, skin tone, body shape, and all physical features MUST remain PIXEL-PERFECT identical to the FIRST image.
2. **Person's Pose:** Body pose, stance, hand position, arm position, leg position MUST be EXACTLY the same as the FIRST image.
3. **Existing Clothing:** ALL clothing currently worn (jacket, shirt, jeans, shoes, etc.) MUST remain completely unchanged in color, fit, texture, and style.
4. **Background:** MUST remain completely unchanged — same studio backdrop, same color, same lighting environment.
5. **Lighting Direction:** The accessory lighting MUST match the existing studio lighting in the FIRST image — same direction, same intensity, same color temperature.

**SPATIAL CONSTRAINTS & COMPOSITION:**
- Leave 12-15% empty space at the TOP of the image (above the person's head)
- Leave 5-8% empty space at the BOTTOM (below the person's feet)
- Leave 12-15% empty space on each SIDE
- Person occupies the central 70-76% width and 77-83% height of the frame
- Full body MUST be visible from head to toe — NO CROPPING

**UNDERSTANDING THE SECOND IMAGE:**
The SECOND image is a PRODUCT CATALOG showing ${accessoryItems.length} accessor${accessoryItems.length === 1 ? "y" : "ies"} arranged in a GRID LAYOUT. This is ONLY a reference showing what each item looks like. Do NOT reproduce the catalog layout.

**ACCESSORY PLACEMENT & RENDERING INSTRUCTIONS:**
${gridDescriptions.join("\n")}

**UNIVERSAL 3D REALISM RULES (apply to ALL accessories):**
1. **Occlusion:** Parts of the accessory that are behind the body MUST be hidden (e.g., the back half of a bracelet is hidden behind the wrist — you only see the front arc and sides curving away).
2. **Contact Shadows:** Every accessory must cast a soft shadow on the skin or clothing surface it rests on. The shadow depth depends on how close the accessory is to the surface.
3. **Surface Conformity:** The accessory must follow the 3D contour of the body part it is on (a bracelet follows the cylinder of the wrist; a necklace drapes in a curve following the neck and chest).
4. **Correct Perspective:** The accessory must be drawn in the same perspective as the rest of the image — no incorrect angles or flat-on views when the body part is at an angle.
5. **Material Rendering:**
   - Metal (silver, gold): bright specular highlights on curved surfaces, subtle reflections
   - Leather: matte surface with grain texture, soft edge shadows
   - Beads/stones: individual light points and translucency if applicable
   - Fabric (scarf): soft, diffuse, with fold creases and gravity drape
6. **Skin Interaction:** Where the accessory presses against skin (bracelet edge, ring band), show a very slight skin compression/indentation — this is what makes it look real vs. pasted on.
7. **Integration:** The accessory must look like it has always been part of the original photo, not added in post.

**STEP-BY-STEP EXECUTION:**
1. Examine the FIRST image carefully — memorize the person's exact pose, clothing, background, and lighting
2. Extract each accessory design from its grid cell in the SECOND image
3. For each accessory:
   a. Identify the exact body location and the 3D geometry of that body part
   b. Render the accessory as a 3D object that wraps around / sits on that geometry
   c. Apply correct lighting, shadows, highlights matching the scene
   d. Ensure the part of the accessory behind the body is NOT visible (occlusion)
   e. Add contact shadow on the surface beneath the accessory
4. Keep ALL existing clothing, background, and the person's appearance exactly as in the FIRST image
5. Review: does this look like a real photo or does anything look digitally composited? Fix any unrealistic areas.

**FINAL VERIFICATION:**
□ Person's face/hair/skin/pose unchanged? (MUST be YES)
□ All existing clothing unchanged? (MUST be YES)
□ Background unchanged? (MUST be YES)
□ All ${accessoryItems.length} accessor${accessoryItems.length === 1 ? "y" : "ies"} (${accessoryListText}) visible and worn naturally in 3D? (MUST be YES)
□ Every accessory has correct occlusion (hidden parts behind body)? (MUST be YES)
□ Every accessory has contact shadows on the skin/clothing beneath it? (MUST be YES)
□ No accessory looks flat, pasted-on, or digitally composited? (MUST be NO flat/pasted look)
□ Result looks like a professional studio photograph? (MUST be YES)

**OUTPUT:** Return ONLY a single photorealistic studio fashion photograph: the person from image 1 (unchanged) now wearing all ${accessoryItems.length} accessor${accessoryItems.length === 1 ? "y" : "ies"} from image 2, rendered as genuine 3D physical objects. The image must be completely indistinguishable from a real photograph.`;

    // -------------------------------------------------------
    // 5. Call Gemini API (same model + pattern as virtualTryOnQueue)
    // -------------------------------------------------------
    const { GoogleGenAI, Modality } = await import("@google/genai");
    const ai = new GoogleGenAI({
      apiKey:
        process.env.GEMINI_API_KEY || "AIzaSyB_m0qCgrF1GGFXnY7DmOEXHwDtnBVEhlY",
    });

    const maxRetries = 5;
    let imageBuffer: Buffer | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`   🤖 Gemini attempt ${attempt}/${maxRetries}...`);

        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash-image",
          contents: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: modelBase64,
              },
            },
            {
              inlineData: {
                mimeType: "image/png",
                data: compositeBase64,
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
              imageBuffer = Buffer.from(part.inlineData.data, "base64");
              console.log(`   ✓ Image generated on attempt ${attempt}`);
              break;
            }
          }
        }

        if (imageBuffer) break;

        console.log(`   ⚠️ No image in response, retrying...`);
      } catch (apiError: any) {
        const isRateLimit =
          apiError?.message?.includes("429") ||
          apiError?.message?.includes("RESOURCE_EXHAUSTED");
        console.log(
          `   ❌ API error on attempt ${attempt}: ${apiError?.message}`,
        );

        if (attempt < maxRetries) {
          const delayMs = isRateLimit
            ? 15000 * Math.pow(1.5, attempt - 1)
            : 3000 * attempt;
          console.log(`   ⏳ Waiting ${Math.round(delayMs / 1000)}s...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    if (!imageBuffer) {
      return {
        success: false,
        message: "Gemini failed to generate an image after all retries.",
        imageUrl: null,
      };
    }

    // -------------------------------------------------------
    // 6. Save locally (no upload, no DB)
    // -------------------------------------------------------
    const fsModule = await import("fs/promises");
    const pathModule = await import("path");

    const timestamp = Date.now();
    const filename = `accessory-tryon-${timestamp}.png`;
    const outputDir = pathModule.join(
      __dirname,
      "../../generated-images/accessory-try-on",
    );
    const outputPath = pathModule.join(outputDir, filename);

    await fsModule.mkdir(outputDir, { recursive: true });
    await fsModule.writeFile(outputPath, imageBuffer);

    console.log(`💾 Saved accessory try-on image: ${outputPath}`);

    return {
      success: true,
      message: `Accessory try-on generated with ${accessoryItems.length} accessor${accessoryItems.length === 1 ? "y" : "ies"} (${accessoryListText}). Saved to: ${filename}`,
      imageUrl: `/generated-images/accessory-try-on/${filename}`,
    };
  } catch (error) {
    console.error("❌ [Test Accessory Try-On] Error:", error);
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to generate accessory try-on image",
      imageUrl: null,
    };
  }
};

/**
 * Helper: Build concise editing prompt for a specific accessory type
 * Used by Vertex AI Imagen Editor for mask-free editing
 */
const buildAccessoryEditPrompt = (
  accessoryType: string,
  description: string,
): string => {
  const type = accessoryType.toLowerCase();

  const basePrompt = `Add the ${accessoryType.toLowerCase()} from the reference image to the person in the main image. The ${accessoryType.toLowerCase()} should be worn naturally on the person. PRESERVE the person's face, body, clothing, pose, and background exactly - only add the accessory. The accessory should match the style shown in the reference image${description ? `: ${description}` : ""}.`;

  // Add type-specific placement instructions
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
  } else {
    return basePrompt;
  }
};
