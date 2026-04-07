import { Job, Queue, Worker } from "bullmq";
import { redisConnection } from "./redis";
import { Outfit } from "../models/outfit.model";
import { Apparel } from "../models/apparel.model";
import { gcsService } from "../services/gcsService";
import { removeBackgroundFromBase64 } from "../services/backgroundRemovalService";
import { GoogleGenAI, Modality } from "@google/genai";
import sharp from "sharp";
import { generateAndStoreOutfitRating } from "../services/langGraphService";
import { generateOutfitSummary } from "../services/accessoryGenerationService";

// Initialize Google Gen AI SDK with API key (not Vertex AI)
const ai = new GoogleGenAI({
  apiKey:
    process.env.GEMINI_API_KEY || "AIzaSyD-dGOfFy8yS9l0LfgdK6rw8iSvudKHmik",
});

// ============================================
// Queue Definition
// ============================================
export const angleGenerationQueue = new Queue("angleGeneration", {
  connection: redisConnection,
});

// ============================================
// Helper Functions
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

function handleApiResponse(response: any): string {
  if (!response?.candidates?.[0]?.content?.parts) {
    throw new Error("No response received from Gemini API");
  }

  const parts = response.candidates[0].content.parts;

  // Find image part
  for (const part of parts) {
    if (part.inlineData?.mimeType?.startsWith("image/")) {
      const mimeType = part.inlineData.mimeType;
      const data = part.inlineData.data;
      return `data:${mimeType};base64,${data}`;
    }
  }

  throw new Error("The AI model did not return an image");
}

function parseDataUrlToInlineData(dataUrl: string): {
  mimeType: string;
  data: string;
} | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    data: match[2],
  };
}

async function createHeadTextureReference(inlineData: {
  mimeType: string;
  data: string;
}): Promise<{ mimeType: string; data: string } | null> {
  try {
    const sourceBuffer = Buffer.from(inlineData.data, "base64");
    const image = sharp(sourceBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return null;
    }

    const width = metadata.width;
    const height = metadata.height;

    const left = Math.max(0, Math.floor(width * 0.2));
    const top = 0;
    const cropWidth = Math.max(1, Math.floor(width * 0.6));
    const cropHeight = Math.max(1, Math.floor(height * 0.18));

    const croppedBuffer = await image
      .extract({
        left,
        top,
        width: Math.min(cropWidth, width - left),
        height: Math.min(cropHeight, height - top),
      })
      .png()
      .toBuffer();

    return {
      mimeType: "image/png",
      data: croppedBuffer.toString("base64"),
    };
  } catch {
    return null;
  }
}

async function createHairDetailReference(inlineData: {
  mimeType: string;
  data: string;
}): Promise<{ mimeType: string; data: string } | null> {
  try {
    const sourceBuffer = Buffer.from(inlineData.data, "base64");
    const image = sharp(sourceBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return null;
    }

    const width = metadata.width;
    const height = metadata.height;

    const left = Math.max(0, Math.floor(width * 0.3));
    const top = 0;
    const cropWidth = Math.max(1, Math.floor(width * 0.4));
    const cropHeight = Math.max(1, Math.floor(height * 0.12));

    const croppedBuffer = await image
      .extract({
        left,
        top,
        width: Math.min(cropWidth, width - left),
        height: Math.min(cropHeight, height - top),
      })
      .png()
      .toBuffer();

    return {
      mimeType: "image/png",
      data: croppedBuffer.toString("base64"),
    };
  } catch {
    return null;
  }
}

async function getInlineImageDimensions(inlineData: {
  mimeType: string;
  data: string;
}): Promise<{ width: number; height: number } | null> {
  try {
    const sourceBuffer = Buffer.from(inlineData.data, "base64");
    const metadata = await sharp(sourceBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      return null;
    }
    return { width: metadata.width, height: metadata.height };
  } catch {
    return null;
  }
}

// ============================================
// Pass-2: Targeted Head/Hair Correction
// ============================================
/**
 * Takes a completed back-view image (pass-1) and issues a second Gemini
 * call that is scoped ONLY to the head/hair region.  Everything below the
 * neck must remain pixel-identical; only hair texture, length, fade, and
 * head silhouette are corrected against the 0° references.
 */
const correctHeadHairRegion = async (
  job: Job,
  pass1DataUrl: string,
  zeroDegreeHeadTextureInline: { mimeType: string; data: string },
  zeroDegreeHairDetailInline: { mimeType: string; data: string } | null,
): Promise<string> => {
  const pass1Inline = parseDataUrlToInlineData(pass1DataUrl);
  if (!pass1Inline)
    throw new Error("Pass-2: could not parse pass-1 image data URL");

  const pass1Dimensions = await getInlineImageDimensions(pass1Inline);
  if (!pass1Dimensions) {
    throw new Error("Pass-2: could not read pass-1 image dimensions");
  }

  const prompt = `You are a surgical image-editing AI.

TASK: Correct ONLY the head and hair region of Image 1 (a full-body back-view photograph) so the hair
exactly matches the reference image(s) provided.

WHAT TO CHANGE:
- Head/hair region only — from the crown of the head down to the base of the neck/collar.
- Fix hair texture, strand detail, length, fade/undercut pattern, and back-of-head silhouette
  to EXACTLY match the reference image(s).

WHAT MUST STAY PIXEL-IDENTICAL:
- Everything at and below the neck/collar: shoulders, body, clothing, hands, shoes, background, lighting, shadows.
- Do NOT alter any garment, background element, or skin area outside the head region.
- Keep the exact same full-body framing/camera distance as Image 1.
- Keep the exact same canvas size as Image 1 (${pass1Dimensions.width}x${pass1Dimensions.height}).

Image 2 is a HEAD CLOSE-UP cropped from the 0° reference — the PRIMARY overall hair reference:
- Match strand thickness, clumping, roughness/smoothness, curl/wave tightness, and fade transition EXACTLY.
- Match hair length, fade cut, undercut level, hairline, ear-coverage, and neckline height EXACTLY.
- Do NOT change hair texture family (e.g., straight→wavy, wavy→curly).
- Do NOT add softness, artificial volume, or length beyond what this reference shows.
- The head must face perfectly straight back in the output — ZERO yaw (no left/right rotation).
- No cheek, jaw edge, nose outline, or any facial feature may be visible from behind.
${
  zeroDegreeHairDetailInline
    ? `
Image 3 is an ULTRA-TIGHT HAIR DETAIL crop from the 0° reference — the HIGHEST-PRIORITY texture reference:
- Use Image 3 as source of truth for fine strand pattern, flyaways, fade sharpness, density, roughness, and micro texture.
- If Image 2 and Image 3 conflict, Image 3 wins for texture detail.
- Do NOT smooth, soften, stylize, or regularize the strand pattern seen in Image 3.
`
    : ""
}

ABSOLUTE RULES:
✗ Do NOT show any face — the person must remain fully back-facing.
✗ Do NOT rotate the head left or right — zero yaw, head centered with spine.
✗ Do NOT show any cheek, jaw edge, nose outline, or any facial profile.
✗ Do NOT change hair colour.
✗ Do NOT increase hair length beyond the reference.
✗ Do NOT let hair extend lower on the neck than in the reference.
✗ Do NOT touch anything outside the head/hair region.
✗ Do NOT add artefacts, new elements, or style changes.
✗ Do NOT crop, zoom, reframe, or change aspect ratio.
✗ Do NOT return a head-only image.

Return the FULL image with ONLY the head/hair region corrected — every other pixel unchanged.`;

  const contents: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  contents.push({ text: prompt });
  contents.push({
    text: "=== IMAGE 1: FULL BACK-VIEW TO CORRECT — modify head/hair region only ===",
  });
  contents.push({ inlineData: pass1Inline });
  contents.push({
    text: "=== IMAGE 2: 0° HEAD CLOSE-UP — PRIMARY HAIR TEXTURE & LENGTH reference ===",
  });
  contents.push({ inlineData: zeroDegreeHeadTextureInline });
  if (zeroDegreeHairDetailInline) {
    contents.push({
      text: "=== IMAGE 3: 0° ULTRA-TIGHT HAIR DETAIL — HIGHEST-PRIORITY STRAND / FADE texture reference ===",
    });
    contents.push({ inlineData: zeroDegreeHairDetailInline });
  }

  const maxRetries = 3;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await job.log(
        `270° pass-2 hair correction attempt ${attempt}/${maxRetries}...`,
      );
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents,
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
      });
      const corrected = handleApiResponse(response);

      const correctedInline = parseDataUrlToInlineData(corrected);
      if (!correctedInline) {
        throw new Error("Pass-2: could not parse corrected image data URL");
      }

      const correctedDimensions =
        await getInlineImageDimensions(correctedInline);
      if (!correctedDimensions) {
        throw new Error("Pass-2: could not read corrected image dimensions");
      }

      if (
        correctedDimensions.width !== pass1Dimensions.width ||
        correctedDimensions.height !== pass1Dimensions.height
      ) {
        throw new Error(
          `Pass-2 returned reframed image (${correctedDimensions.width}x${correctedDimensions.height}) instead of full canvas (${pass1Dimensions.width}x${pass1Dimensions.height})`,
        );
      }

      await job.log("270° pass-2 hair correction succeeded");
      return corrected;
    } catch (error: any) {
      const isRateLimit =
        error?.message?.includes("429") ||
        error?.message?.includes("RESOURCE_EXHAUSTED");
      if (isRateLimit && attempt < maxRetries) {
        const delayMs = 10000 * Math.pow(2, attempt - 1);
        await job.log(
          `270° pass-2: rate limit — retrying in ${delayMs / 1000}s...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else if (attempt === maxRetries) {
        await job.log(`270° pass-2: failed after ${maxRetries} attempts`);
        throw error;
      }
    }
  }

  throw new Error("270° hair correction pass-2 exhausted all retries");
};

type BackPromptCategory = "top" | "bottom" | "outerwear" | "dress" | "shoe";

interface BackReferenceItem {
  category: BackPromptCategory;
  apparelId: number;
  referenceUrl: string;
  referenceType: "back" | "front";
}

interface BackAngleAvailability {
  top?: boolean;
  bottom?: boolean;
  outerwear?: boolean;
  dress?: boolean;
}

const generateBackAngleView = async (
  job: Job,
  outfit: Outfit,
  modelImageBase64: string,
  userId: number,
  zeroDegreeDataUrl: string | null,
  backAngleAvailability: BackAngleAvailability | undefined,
): Promise<string> => {
  // ── 1. Build apparel reference list ──────────────────────────────────────
  const backReferenceItems = await buildBackReferenceItems(
    outfit,
    userId,
    backAngleAvailability,
  );

  // ── 2. Parse optional 0° image (hair-only reference) ────────────────────
  const zeroDegreeInline = zeroDegreeDataUrl
    ? parseDataUrlToInlineData(zeroDegreeDataUrl)
    : null;

  const modelInline = {
    mimeType: "image/jpeg",
    data: modelImageBase64,
  };

  const zeroDegreeHeadTextureInline = zeroDegreeInline
    ? await createHeadTextureReference(zeroDegreeInline)
    : null;
  const zeroDegreeHairDetailInline = zeroDegreeInline
    ? await createHairDetailReference(zeroDegreeInline)
    : null;
  await job.log(
    zeroDegreeInline
      ? "270°: using original model image for scene/body + 0° image as strict HEAD reference (hair + facial edge consistency)"
      : "270°: no 0° image available for head reference",
  );
  await job.log(
    `270°: head texture refs → overall:${zeroDegreeHeadTextureInline ? "yes" : "no"}, detail:${zeroDegreeHairDetailInline ? "yes" : "no"}`,
  );

  // ── 3. Download apparel reference images eagerly ─────────────────────────
  const apparelRefs: Array<{
    item: BackReferenceItem;
    inlineData: { mimeType: string; data: string };
  }> = [];

  for (const item of backReferenceItems) {
    try {
      const b64 = await downloadAndConvertToBase64(item.referenceUrl);
      apparelRefs.push({
        item,
        inlineData: { mimeType: "image/jpeg", data: b64 },
      });
      await job.log(
        `270°: loaded apparel ${item.apparelId} (${item.category}, ${item.referenceType})`,
      );
    } catch (err) {
      await job.log(
        `270°: skipping apparel ${item.apparelId} — ${
          err instanceof Error ? err.message : "download failed"
        }`,
      );
    }
  }

  // ── 4. Build prompt ───────────────────────────────────────────────────────
  //  Image order:
  //    slot 1: 0° ultra-tight hair detail ref (if available, highest priority)
  //    slot 2: 0° head crop texture ref (if available)
  //    slot 3: 0° image (strict head anchor, if available)
  //    slot 4: original model image (scene/body anchor)
  //    slot 5+: each apparel ref, one per slot
  let slotIndex = 1;
  const zeroDegreeHairDetailSlot = zeroDegreeHairDetailInline
    ? slotIndex++
    : null;
  const zeroDegreeHeadTextureSlot = zeroDegreeHeadTextureInline
    ? slotIndex++
    : null;
  const zeroDegreeSlot = zeroDegreeInline ? slotIndex++ : null;
  const modelSlot = slotIndex++;
  const apparelSlots = apparelRefs.map(() => slotIndex++);

  const apparelInstructions = apparelRefs
    .map(({ item }, i) => {
      const slot = apparelSlots[i];
      if (item.category === "shoe") {
        return `Image ${slot} — SHOE FRONT REFERENCE: infer the heel shape, back tab, rear collar, and sole edge profile from this front reference. Render that exact design on the shoes as seen from behind.`;
      }
      if (item.referenceType === "back") {
        return `Image ${slot} — ${item.category.toUpperCase()} BACK REFERENCE: this image shows the actual back side of the ${item.category}. You MUST reproduce every visible detail from this image on the garment — all prints, seams, logos, stitching, panels, zips, or graphics shown here must appear on the back of the ${item.category} in your output. Do not ignore or simplify any design element.`;
      }
      return `Image ${slot} — ${item.category.toUpperCase()} FRONT REFERENCE: infer a realistic back construction that preserves fabric, colour, pattern, fit, and overall design language.`;
    })
    .join("\n");

  const prompt = `You are a photorealistic fashion photography AI.

TASK: Produce one photorealistic full-body BACK-VIEW photograph of the same person in the same outfit and scene.

─── IMAGES SENT WITH THIS PROMPT ───────────────────────────────────────────
${zeroDegreeHairDetailSlot ? `Image ${zeroDegreeHairDetailSlot}: 0° ULTRA-TIGHT HAIR DETAIL — HIGHEST-PRIORITY strand/fade texture reference` : ""}
${zeroDegreeHeadTextureSlot ? `Image ${zeroDegreeHeadTextureSlot}: 0° HEAD CLOSE-UP — PRIMARY HAIR TEXTURE reference` : ""}
${zeroDegreeSlot ? `Image ${zeroDegreeSlot}: 0° SIDE PROFILE — EXCLUSIVE HEAD reference (hair + facial edge consistency)` : ""}
Image ${modelSlot}: ORIGINAL FRONT-FACING MODEL — scene/body reference only
${apparelRefs.map(({ item }, i) => `Image ${apparelSlots[i]}: ${item.category.toUpperCase()} ${item.referenceType === "back" ? "BACK" : item.category === "shoe" ? "FRONT" : "FRONT"} REFERENCE`).join("\n")}
─────────────────────────────────────────────────────────────────────────────

STEP 1 — HARD-LOCK IDENTITY FROM IMAGE ${modelSlot}:
Image ${modelSlot} is source of truth for scene, body proportions, and skin tone continuity.
Do NOT use Image ${modelSlot} to override hair length, hair texture, or head silhouette if Image ${zeroDegreeSlot ?? modelSlot} provides head evidence.
Do NOT use any apparel reference image for face or hair decisions.
${
  zeroDegreeSlot
    ? `
STEP 1B — STRICT HEAD LOCK FROM IMAGE ${zeroDegreeSlot}:
Image ${zeroDegreeSlot} is the EXCLUSIVE HEAD reference.
- Use it for head silhouette, ear shape/placement, jaw edge/profile hint, and ALL hair attributes.
- Hair must match EXACTLY: type, texture, density/volume, length, fade/undercut pattern, hairline shape, and back-of-head flow.
- If Image ${zeroDegreeSlot} shows short/fade hair, output must keep the same short/fade length at the back of head.
- NEVER generate longer hair than what appears in Image ${zeroDegreeSlot}.
- The back-of-head hair silhouette must not extend lower than the neckline level implied by Image ${zeroDegreeSlot}.
- Ear exposure/coverage must stay consistent with Image ${zeroDegreeSlot}; do not suddenly cover exposed ears with longer hair.
- Use Image ${zeroDegreeSlot} for HAIR AND HEAD SHAPE only, not for preserving its side-turn angle.
`
    : ""
}

STEP 1C — HAIR TEXTURE LOCK (STRAND-LEVEL):
${zeroDegreeHairDetailSlot ? `- Image ${zeroDegreeHairDetailSlot} is the HIGHEST-PRIORITY micro-texture reference. Match fine strand pattern, flyaways, fade sharpness, density, and roughness exactly.` : ""}
${zeroDegreeHeadTextureSlot ? `- Image ${zeroDegreeHeadTextureSlot} is the PRIMARY overall hair-texture reference. Match strand thickness, clumping, roughness/smoothness, curl/wave tightness, and fade transition exactly.` : "- Primary 0° head close-up is unavailable."}
- Do NOT change hair texture family (e.g., coarse→silky, straight→wavy, wavy→curly).
- Do NOT add synthetic volume, length, or softness.
- If the model image implies a different hair texture than the close-up references, IGNORE the model image and follow the close-up references.

Do NOT beautify, age-shift, smooth, or reinterpret any of these values.

STEP 2 — LOCK SCENE AND BODY FROM IMAGE ${modelSlot}:
Lock: background, lighting direction, shadow quality, white-balance, body proportions, and pose continuity.

STEP 3 — APPLY GARMENT BACK DETAILS:
${apparelInstructions || `Infer realistic garment backs from Image ${modelSlot}.`}

STEP 4 — GENERATE:
Render one photorealistic full-body image with:
- Body: fully back-facing, person turned completely away from camera
- Head: perfectly straight back-facing with ZERO left/right turn (zero yaw)
- Head alignment: centered with the spine and shoulders, not rotated toward viewer-left or viewer-right
- Face visibility: NO face visible at all — no cheek, no jaw edge, no nose bridge, no eye area
- Symmetry: the back of the head should appear balanced and symmetrical, not angled to one side
- Hair: exact same hair as locked in ${zeroDegreeSlot ? `Step 1B (0° strict head reference)` : `Step 1`} — back-of-head view, preserving exact length and fade/undercut structure
- Hair texture: replicate Step 1C close-up texture references exactly at strand level (no smoothing, no style-family shift)
- Hair silhouette: preserve the same neckline height and ear-coverage behavior seen in the 0° reference
- Outfit: same garments rendered from behind using apparel references
- Scene: identical background, lighting, and framing from Image ${modelSlot}
- Quality: same photorealistic resolution and colour grading

ABSOLUTE RULES:
✗ Do NOT show the face — the person is fully back-facing
✗ Do NOT rotate the head left or right
✗ Do NOT show any cheek line, jaw edge, nose outline, or facial profile
✗ Do NOT change hair type, texture, colour, or length
✗ Do NOT increase hair length beyond the 0° head reference
✗ Do NOT let hair extend lower on the neck than in the 0° reference
✗ Do NOT hide ears if the 0° reference shows them exposed
✗ Do NOT smooth, soften, or restyle hair texture
✗ Do NOT change skin tone or body proportions
✗ Do NOT omit any back-side design details from BACK REFERENCE images
✗ Do NOT use apparel images as face or hair guides
${zeroDegreeSlot ? `✗ Do NOT ignore Image ${zeroDegreeSlot} head silhouette and hair length` : ""}

Return ONE final photorealistic back-view photograph with NO face visible.`;

  // ── 5. Assemble contents ──────────────────────────────────────────────────
  //  Layout: [text prompt] → [0° ultra-tight detail crop] → [0° texture crop] → [0° strict head-ref] → [model label + image] → [apparel label + image] × N
  //  Texture references are intentionally sent first so they dominate hair rendering.
  const contents: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  contents.push({ text: prompt });

  if (zeroDegreeHairDetailInline && zeroDegreeHairDetailSlot) {
    contents.push({
      text: `=== IMAGE ${zeroDegreeHairDetailSlot}: 0° ULTRA-TIGHT HAIR DETAIL — HIGHEST-PRIORITY strand / fade texture reference. Match micro texture exactly. ===`,
    });
    contents.push({ inlineData: zeroDegreeHairDetailInline });
  }

  if (zeroDegreeHeadTextureInline && zeroDegreeHeadTextureSlot) {
    contents.push({
      text: `=== IMAGE ${zeroDegreeHeadTextureSlot}: 0° HEAD CLOSE-UP — PRIMARY HAIR TEXTURE reference. Match strand texture exactly. ===`,
    });
    contents.push({ inlineData: zeroDegreeHeadTextureInline });
  }

  if (zeroDegreeInline && zeroDegreeSlot) {
    contents.push({
      text: `=== IMAGE ${zeroDegreeSlot}: 0° SIDE PROFILE — STRICT HEAD/HAIR reference. Use for hair length, fade, head shape, and ear placement only; final 270° head must still face straight back. ===`,
    });
    contents.push({ inlineData: zeroDegreeInline });
  }

  contents.push({
    text: `=== IMAGE ${modelSlot}: ORIGINAL FRONT-FACING MODEL — scene/body/lighting reference only. Do not override head/hair evidence from earlier images. ===`,
  });
  contents.push({
    inlineData: { mimeType: "image/jpeg", data: modelImageBase64 },
  });

  for (let i = 0; i < apparelRefs.length; i++) {
    const { item, inlineData } = apparelRefs[i];
    const slot = apparelSlots[i];
    const refType =
      item.referenceType === "back"
        ? `BACK SIDE OF ${item.category.toUpperCase()} — REPRODUCE THIS DESIGN ON THE GARMENT BACK`
        : item.category === "shoe"
          ? `FRONT OF SHOE — USE TO INFER HEEL/BACK-TAB/SOLE`
          : `FRONT OF ${item.category.toUpperCase()} — USE TO INFER BACK CONSTRUCTION`;
    contents.push({
      text: `=== IMAGE ${slot}: ${refType} ===`,
    });
    contents.push({ inlineData });
  }

  await job.log(
    `270°: sending ${contents.filter((c) => "inlineData" in c).length} image(s) to Gemini` +
      ` (${zeroDegreeHairDetailInline ? "0° detail crop, " : ""}${zeroDegreeHeadTextureInline ? "0° texture close-up, " : ""}${zeroDegreeInline ? "0° head ref, " : ""}model scene/body, ${apparelRefs.length} apparel ref(s))`,
  );

  // ── 6. Gemini call with retry ─────────────────────────────────────────────
  const maxRetries = 5;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await job.log(`270° attempt ${attempt}/${maxRetries}...`);

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-image",
        contents,
        config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
      });

      const result = handleApiResponse(response);
      await job.log("270°: pass-1 image generated successfully");

      // ── Pass-2: targeted head/hair correction ───────────────────────────
      if (zeroDegreeHeadTextureInline) {
        await job.log("270°: running pass-2 targeted head/hair correction...");
        try {
          const corrected = await correctHeadHairRegion(
            job,
            result,
            zeroDegreeHeadTextureInline,
            zeroDegreeHairDetailInline,
          );
          return corrected;
        } catch (correctionError: any) {
          await job.log(
            `270°: pass-2 failed (${correctionError?.message ?? "unknown"}) — falling back to pass-1 result`,
          );
          return result;
        }
      }

      return result;
    } catch (error: any) {
      const isRateLimit =
        error?.message?.includes("429") ||
        error?.message?.includes("RESOURCE_EXHAUSTED");

      if (isRateLimit && attempt < maxRetries) {
        const delayMs = 10000 * Math.pow(2, attempt - 1);
        await job.log(`270°: rate limit — retrying in ${delayMs / 1000}s...`);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else if (attempt === maxRetries) {
        await job.log(`270°: failed after ${maxRetries} attempts`);
        throw error;
      }
    }
  }

  throw new Error("270° generation exhausted all retries");
};

const toBackPromptCategory = (category: string): BackPromptCategory | null => {
  if (category === "top") return "top";
  if (category === "bottom") return "bottom";
  if (category === "outerwear") return "outerwear";
  if (category === "dress") return "dress";
  if (category === "shoe") return "shoe";
  return null;
};

const buildBackReferenceItems = async (
  outfit: Outfit,
  userId: number,
  availability?: BackAngleAvailability,
): Promise<BackReferenceItem[]> => {
  const outfitApparelIds = [
    outfit.topId,
    outfit.bottomId,
    outfit.shoeId,
    outfit.outerwearId,
    outfit.dressId,
  ].filter((id) => id && id > 0);

  if (outfitApparelIds.length === 0) {
    return [];
  }

  const apparels = await Apparel.findAll({
    where: {
      id: outfitApparelIds,
      userId,
      status: "complete",
    },
  });

  const backReferenceItems: BackReferenceItem[] = [];

  for (const apparel of apparels) {
    const mappedCategory = toBackPromptCategory(apparel.category);
    if (!mappedCategory) {
      continue;
    }

    // Shoes never have back images — always use front reference.
    // For other categories, check availability flags and stored back URLs.
    let referenceUrl: string;
    let referenceType: "back" | "front";

    if (apparel.category === "shoe") {
      referenceUrl = apparel.urlProcessed || apparel.urlRaw || "";
      referenceType = "front";
    } else {
      const hasBackReference = Boolean(
        (apparel.urlProcessedBack && apparel.urlProcessedBack.trim() !== "") ||
        (apparel.urlRawBack && apparel.urlRawBack.trim() !== ""),
      );

      const frontendHasBack =
        availability?.[mappedCategory as Exclude<BackPromptCategory, "shoe">];
      const shouldUseBackReference =
        frontendHasBack === undefined
          ? hasBackReference
          : frontendHasBack && hasBackReference;

      referenceUrl = shouldUseBackReference
        ? apparel.urlProcessedBack || apparel.urlRawBack || ""
        : apparel.urlProcessed || apparel.urlRaw || "";
      referenceType = shouldUseBackReference ? "back" : "front";
    }

    if (!referenceUrl) {
      continue;
    }

    backReferenceItems.push({
      category: mappedCategory,
      apparelId: apparel.id,
      referenceUrl,
      referenceType,
    });
  }

  return backReferenceItems;
};

// ============================================
// Worker Definition
// ============================================
const angleGenerationWorker = new Worker(
  "angleGeneration",
  async (job: Job) => {
    const {
      outfitId,
      gsUrl,
      userId,
      skipAngles = [],
      backAngleAvailability,
    } = job.data;

    try {
      await job.updateProgress(5);
      await job.log(`Starting angle generation for outfit: ${outfitId}`);

      const outfit = await Outfit.findOne({ where: { id: outfitId } });
      if (!outfit) {
        throw new Error(`Outfit ${outfitId} not found`);
      }

      // Download model image
      await job.log(`Downloading model image from: ${gsUrl}`);
      const modelImageBase64 = await downloadAndConvertToBase64(gsUrl);

      await job.updateProgress(10);

      // Define angles
      const angles: { [key: string]: { name: string; prompt: string } } = {
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
      const imageUrls: { [key: string]: string } = {};

      // Add the 90-degree angle using the existing primary image (from virtual try-on)
      // This is the front-facing view that already exists, so we don't need to regenerate it
      if (skipAngles.includes("90")) {
        imageUrls["90"] = gsUrl;
        await job.log(
          "Using existing primary image as 90° (front-facing) view",
        );
      }

      let processedAngles = 0;
      const totalAngles = Object.keys(angles).filter(
        (degree) => !skipAngles.includes(degree),
      ).length;

      // Generate each angle
      for (const [degree, config] of Object.entries(angles)) {
        if (skipAngles.includes(degree)) {
          await job.log(
            `Skipping generation for ${config.name} view (already exists)`,
          );
          continue;
        }

        const maxRetries = 5;
        let base64Result = "";

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            await job.log(
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

            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash-image",
              contents: [
                { text: fullPrompt },
                {
                  inlineData: {
                    mimeType: "image/jpeg",
                    data: modelImageBase64,
                  },
                },
              ],
              config: { responseModalities: [Modality.IMAGE, Modality.TEXT] },
            });

            base64Result = handleApiResponse(response);
            await job.log(`Generated ${config.name} view successfully`);
            break;
          } catch (error: any) {
            const isRateLimitError =
              error?.message?.includes("429") ||
              error?.message?.includes("RESOURCE_EXHAUSTED");

            if (isRateLimitError && attempt < maxRetries) {
              const delayMs = 10000 * Math.pow(2, attempt - 1);
              await job.log(
                `Rate limit hit for ${config.name}. Retrying in ${
                  delayMs / 1000
                }s...`,
              );
              await new Promise((resolve) => setTimeout(resolve, delayMs));
            } else if (attempt === maxRetries) {
              await job.log(
                `Failed to generate ${config.name} view after ${maxRetries} attempts`,
              );
              base64Result = "";
            }
          }
        }

        if (base64Result && base64Result.trim() !== "") {
          results[degree] = base64Result;

          // Apply background removal
          try {
            await job.log(`Applying background removal to ${degree}° angle...`);
            const bgRemovedBase64 = await removeBackgroundFromBase64(
              base64Result,
              { background: "transparent" },
            );

            // Upload to GCS
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const fileName = `angle-${degree}-${timestamp}.png`;

            const uploadResult = await gcsService.uploadBase64Image(
              bgRemovedBase64,
              fileName,
              userId,
              `VirtualTryOn/${outfitId}/angles`,
              "image/png",
            );

            imageUrls[degree] = uploadResult.httpUrl;
            await job.log(`Uploaded ${degree}° angle to GCS`);
          } catch (uploadError: any) {
            await job.log(
              `Failed to process ${degree}° angle: ${uploadError.message}`,
            );
          }
        }

        processedAngles++;
        const progress = 10 + Math.floor((processedAngles / totalAngles) * 80);
        await job.updateProgress(progress);

        // Add delay between requests
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }

      // ── 270° back angle — run ONLY if 0° was successfully generated ─────
      if (!results["0"]) {
        await job.log(
          "Skipping 270° generation because 0° angle was not generated successfully",
        );
      } else {
        await job.log(
          "Generating 270° back-angle view (dedicated call; gated on successful 0°)...",
        );
        try {
          const backBase64 = await generateBackAngleView(
            job,
            outfit,
            modelImageBase64,
            Number(userId),
            results["0"],
            backAngleAvailability,
          );

          results["270"] = backBase64;

          const bgRemovedBack = await removeBackgroundFromBase64(backBase64, {
            background: "transparent",
          });
          const backTimestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const backFileName = `angle-270-${backTimestamp}.png`;
          const backUpload = await gcsService.uploadBase64Image(
            bgRemovedBack,
            backFileName,
            userId,
            `VirtualTryOn/${outfitId}/angles`,
            "image/png",
          );
          imageUrls["270"] = backUpload.httpUrl;
          await job.log(`270° back-angle uploaded to GCS`);
        } catch (backError: any) {
          await job.log(
            `270°: generation failed — ${backError?.message ?? "unknown error"}`,
          );
        }
      }

      await job.updateProgress(90);
      await job.log("Updating outfit record...");

      // Update outfit with angle URLs and set visibility to true
      if (outfit) {
        await outfit.update({
          imageList: imageUrls, // Fixed: was angleImages, should be imageList
          visible: true, // Set outfit visibility to true after angle generation
        });
        await job.log(
          `Updated outfit ${outfitId} with ${
            Object.keys(imageUrls).length
          } angle images and set visibility to true`,
        );
      } else {
        await job.log(
          `Warning: Outfit ${outfitId} not found, couldn't update imageList`,
        );
      }

      await job.updateProgress(92);

      // Generate outfit summary using LangGraph
      try {
        await job.log("Generating outfit summary via LangGraph service...");
        if (outfit) {
          const outfitSummary = await generateOutfitSummary(
            outfit.primaryImageUrl!,
          );
          await outfit.update({ outfitSummary });
          await job.log(
            `✅ Outfit summary generated: ${outfitSummary.substring(0, 100)}...`,
          );
        }
      } catch (summaryError: any) {
        // Don't fail the entire job if summary generation fails
        await job.log(
          `⚠️ Warning: Failed to generate outfit summary: ${summaryError.message}`,
        );
        console.warn(
          `Failed to generate outfit summary for outfit ${outfitId}:`,
          summaryError,
        );
      }

      await job.updateProgress(96);

      // Generate and store outfit rating
      try {
        await job.log("Generating outfit rating via LangGraph service...");
        const rating = await generateAndStoreOutfitRating(outfitId, userId);
        await job.log(`✅ Outfit rating generated: ${rating}`);
      } catch (ratingError: any) {
        // Don't fail the entire job if rating generation fails
        await job.log(
          `⚠️ Warning: Failed to generate rating: ${ratingError.message}`,
        );
        console.warn(
          `Failed to generate rating for outfit ${outfitId}:`,
          ratingError,
        );
      }

      await job.updateProgress(100);
      await job.log("Angle generation completed successfully");

      const successCount = Object.keys(imageUrls).length;
      const generatedCount =
        Object.keys(imageUrls).length - (skipAngles.includes("90") ? 1 : 0);
      console.log(
        `✅ Angle generation completed for outfit ${outfitId}: ${generatedCount} new angles generated, ${successCount} total angles available`,
      );

      return {
        success: true,
        message: `Generated ${generatedCount} new angle views (${successCount} total including existing 90° view)`,
        anglesGenerated: successCount, // Total angles including the existing 90° view
        imageUrls,
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
    concurrency: 1, // Very low - each job makes 5 sequential API calls
  },
);

// ============================================
// Event Listeners
// ============================================
angleGenerationWorker.on("completed", (job: Job, returnValue: any) => {
  console.log(`✅ Angle Generation Job ${job.id} completed successfully`);
});

angleGenerationWorker.on("failed", (job: any, err: Error) => {
  console.error(`❌ Angle Generation Job ${job?.id} failed: ${err.message}`);
});

angleGenerationWorker.on("error", (err: Error) => {
  console.error(`❌ Angle Generation Worker error: ${err.message}`);
});

// ============================================
// Function to Add Jobs to Queue
// ============================================
export const addAngleGenerationJob = async (data: any) => {
  try {
    const job = await angleGenerationQueue.add("generateAngles", data, {
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 10000,
      },
      removeOnComplete: {
        age: 3600,
        count: 500,
      },
      removeOnFail: {
        age: 86400,
      },
    });

    console.log(`📋 Angle Generation job added to queue with ID: ${job.id}`);
    return job.id;
  } catch (error) {
    console.error("Error adding angle generation job to queue:", error);
    throw error;
  }
};
