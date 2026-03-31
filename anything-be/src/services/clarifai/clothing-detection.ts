import * as fs from "fs";
import * as path from "path";
import { CATEGORY_MAP } from "./clothingConceptMap";

export interface BoundingBox {
  topRow: number;
  leftCol: number;
  bottomRow: number;
  rightCol: number;
}

export interface ClothingConcept {
  name: string;
  confidence: number;
}

export interface ClothingRegion {
  boundingBox: BoundingBox;
  concepts: ClothingConcept[];
}

export interface ClothingDetectionResult {
  success: boolean;
  message?: string;
  regions: ClothingRegion[];
  totalRegions: number;
}

export class ClarifaiClothingDetectionService {
  private PAT: string;
  private USER_ID: string;
  private APP_ID: string;
  private MODEL_ID: string;
  private MODEL_VERSION_ID: string;

  constructor() {
    this.PAT = process.env.PAT!;
    this.USER_ID = process.env.USER_ID!;
    this.APP_ID = process.env.APP_ID!;
    this.MODEL_ID = process.env.MODEL_ID!;
    this.MODEL_VERSION_ID = process.env.MODEL_VERSION_ID!;

    console.log("Environment variables loaded:");
    console.log("PAT:", this.PAT ? "Present" : "Missing");
    console.log("USER_ID:", this.USER_ID || "Missing");
    console.log("APP_ID:", this.APP_ID || "Missing");
    console.log("MODEL_ID:", this.MODEL_ID || "Missing");
    console.log("MODEL_VERSION_ID:", this.MODEL_VERSION_ID || "Missing");

    if (
      !this.PAT ||
      !this.USER_ID ||
      !this.APP_ID ||
      !this.MODEL_ID ||
      !this.MODEL_VERSION_ID
    ) {
      throw new Error(
        "Missing required Clarifai configuration in environment variables",
      );
    }

    // Log CATEGORY_MAP for debugging
    console.log("\n📋 [CLARIFAI] Loaded CATEGORY_MAP:");
    const categorized = {
      top: Object.keys(CATEGORY_MAP).filter((k) => CATEGORY_MAP[k] === "top"),
      bottom: Object.keys(CATEGORY_MAP).filter(
        (k) => CATEGORY_MAP[k] === "bottom",
      ),
      onePiece: Object.keys(CATEGORY_MAP).filter(
        (k) => CATEGORY_MAP[k] === "onePiece",
      ),
      shoe: Object.keys(CATEGORY_MAP).filter((k) => CATEGORY_MAP[k] === "shoe"),
      excluded: Object.keys(CATEGORY_MAP).filter(
        (k) => CATEGORY_MAP[k] === null,
      ),
    };
    console.log("   Top items:", categorized.top.join(", "));
    console.log("   Bottom items:", categorized.bottom.join(", "));
    console.log("   One-piece items:", categorized.onePiece.join(", "));
    console.log("   Shoe items:", categorized.shoe.join(", "));
    console.log("   Excluded accessories:", categorized.excluded.join(", "));
  }

  /**
   * Detect clothing in an image using base64 data
   */
  async detectClothingFromBase64(
    base64Image: string,
  ): Promise<ClothingDetectionResult> {
    const apiUrl = `https://api.clarifai.com/v2/models/${this.MODEL_ID}/versions/${this.MODEL_VERSION_ID}/outputs`;

    console.log(`\n🌐 [CLARIFAI] Preparing API request...`);
    console.log(`   URL: ${apiUrl}`);
    console.log(`   Model ID: ${this.MODEL_ID}`);
    console.log(`   Version ID: ${this.MODEL_VERSION_ID}`);
    console.log(`   User ID: ${this.USER_ID}`);
    console.log(`   App ID: ${this.APP_ID}`);
    console.log(`   PAT length: ${this.PAT?.length || 0} chars`);
    console.log(
      `   Base64 image size: ${base64Image.length} chars (~${Math.round(base64Image.length / 1024)} KB)`,
    );

    try {
      const requestData = {
        user_app_id: {
          user_id: this.USER_ID,
          app_id: this.APP_ID,
        },
        inputs: [
          {
            data: {
              image: {
                base64: base64Image,
              },
            },
          },
        ],
      };

      const requestOptions = {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: "Key " + this.PAT,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestData),
      };

      console.log(`📤 [CLARIFAI] Sending request to Clarifai API...`);
      console.log(
        `   Request body size: ${requestOptions.body.length} bytes (~${Math.round(requestOptions.body.length / 1024)} KB)`,
      );
      console.log(
        `   Headers: ${JSON.stringify({ ...requestOptions.headers, Authorization: "Key [REDACTED]" })}`,
      );

      const fetchStartTime = Date.now();
      let response: Response;

      try {
        response = await fetch(apiUrl, requestOptions);
        const fetchDuration = Date.now() - fetchStartTime;
        console.log(`✅ [CLARIFAI] Fetch completed in ${fetchDuration}ms`);
        console.log(
          `   Response status: ${response.status} ${response.statusText}`,
        );
        console.log(`   Response ok: ${response.ok}`);
        console.log(`   Response type: ${response.type}`);
        console.log(
          `   Response content-type: ${response.headers.get("content-type")}`,
        );
      } catch (fetchError) {
        const fetchDuration = Date.now() - fetchStartTime;
        console.error(`\n❌ [CLARIFAI] Fetch failed after ${fetchDuration}ms`);
        console.error(
          `   Error type: ${fetchError?.constructor?.name || "Unknown"}`,
        );
        console.error(
          `   Error message: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`,
        );
        console.error(
          `   Error stack:`,
          fetchError instanceof Error ? fetchError.stack : "No stack trace",
        );
        console.error(`   URL attempted: ${apiUrl}`);
        console.error(`   Network diagnostics:`);
        console.error(`     - Check internet connectivity`);
        console.error(`     - Verify Clarifai API is accessible`);
        console.error(`     - Check for firewall/proxy issues`);
        console.error(`     - Verify DNS resolution for api.clarifai.com`);

        throw new Error(
          `Fetch failed: ${fetchError instanceof Error ? fetchError.message : "Unknown network error"}. Check network connectivity and Clarifai API accessibility.`,
        );
      }

      console.log(`📥 [CLARIFAI] Parsing response body...`);
      let result: any;
      try {
        result = await response.json();
        console.log(`✅ [CLARIFAI] Response parsed successfully`);
        console.log(`   Response status code: ${result.status?.code || "N/A"}`);
        console.log(
          `   Response status description: ${result.status?.description || "N/A"}`,
        );
      } catch (parseError) {
        console.error(`❌ [CLARIFAI] Failed to parse response JSON`);
        console.error(
          `   Parse error: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        );
        const responseText = await response.text();
        console.error(
          `   Raw response text (first 500 chars): ${responseText.substring(0, 500)}`,
        );
        throw new Error(
          `Failed to parse Clarifai response: ${parseError instanceof Error ? parseError.message : "Unknown parse error"}`,
        );
      }

      if (result.status.code !== 10000) {
        console.error(`\n❌ [CLARIFAI] API returned error status`);
        console.error(`   Status code: ${result.status.code}`);
        console.error(`   Description: ${result.status.description}`);
        console.error(
          `   Full status:`,
          JSON.stringify(result.status, null, 2),
        );

        return {
          success: false,
          message: `Clarifai API Error: ${result.status.description}`,
          regions: [],
          totalRegions: 0,
        };
      }

      console.log(`✅ [CLARIFAI] API request successful (status code: 10000)`);

      // Process results - validate structure first
      if (!result.outputs || !result.outputs[0] || !result.outputs[0].data) {
        console.error(`\n❌ [CLARIFAI] Invalid response structure`);
        console.error(`   outputs exists: ${!!result.outputs}`);
        console.error(`   outputs[0] exists: ${!!result.outputs?.[0]}`);
        console.error(
          `   outputs[0].data exists: ${!!result.outputs?.[0]?.data}`,
        );
        return {
          success: false,
          message: `Clarifai API returned invalid response structure`,
          regions: [],
          totalRegions: 0,
        };
      }

      const regions = result.outputs[0].data.regions || [];
      console.log(`📊 [CLARIFAI] Processing detection results...`);
      console.log(`   Total raw regions detected: ${regions.length}`);

      if (regions.length > 0) {
        console.log(
          `   Sample region concepts:`,
          regions[0]?.data?.concepts
            ?.slice(0, 3)
            .map((c: any) => `${c.name}:${Math.round(c.value * 100)}%`),
        );
      }
      // const processedRegions: ClothingRegion[] = regions.map((region: any) => ({
      //   boundingBox: {
      //     topRow: region.region_info.bounding_box.top_row,
      //     leftCol: region.region_info.bounding_box.left_col,
      //     bottomRow: region.region_info.bounding_box.bottom_row,
      //     rightCol: region.region_info.bounding_box.right_col,
      //   },
      //   concepts: region.data.concepts.map((concept: any) => ({
      //     name: concept.name,
      //     confidence: Math.round(concept.value * 100),
      //   })),
      // }));

      const processedRegions: ClothingRegion[] = regions.map(
        (region: any, index: number) => {
          console.log(
            `\n🔍 [CLARIFAI] Processing region ${index + 1}/${regions.length}`,
          );

          const rawConcepts = region.data.concepts || [];
          console.log(
            `   Raw concepts (${rawConcepts.length}):`,
            rawConcepts
              .slice(0, 5)
              .map((c: any) => `${c.name}:${Math.round(c.value * 100)}%`)
              .join(", "),
          );

          const validConcepts = rawConcepts
            .map((concept: any) => {
              const normalized = concept.name.toLowerCase();
              const category = CATEGORY_MAP[normalized];
              const confidence = Math.round(concept.value * 100);

              if (!category) {
                console.log(
                  `   ⏭️  Skipping "${concept.name}" (${confidence}%) - not in CATEGORY_MAP`,
                );
                return null;
              }

              console.log(
                `   ✅ Keeping "${concept.name}" → ${category} (${confidence}%)`,
              );

              return {
                name: normalized,
                category,
                confidence,
              };
            })
            .filter(Boolean);

          console.log(
            `   Valid concepts after filtering: ${validConcepts.length}`,
          );
          console.log(
            `   Bounding box: top=${region.region_info.bounding_box.top_row.toFixed(3)}, left=${region.region_info.bounding_box.left_col.toFixed(3)}, bottom=${region.region_info.bounding_box.bottom_row.toFixed(3)}, right=${region.region_info.bounding_box.right_col.toFixed(3)}`,
          );

          return {
            boundingBox: {
              topRow: region.region_info.bounding_box.top_row,
              leftCol: region.region_info.bounding_box.left_col,
              bottomRow: region.region_info.bounding_box.bottom_row,
              rightCol: region.region_info.bounding_box.right_col,
            },
            concepts: validConcepts,
          };
        },
      );

      //TODO HERE ADD THE LOGIC TOO SAVE ONLY THE CONCEPTS WE WANT TO SAVE

      // -----------------------------
      // 2. APPLY CATEGORY RESOLUTION LOGIC HERE
      // -----------------------------
      console.log(`\n🔧 [CLARIFAI] Applying category resolution logic...`);
      const resolvedRegions = processedRegions.map((region, index) => {
        console.log(
          `   Resolving region ${index + 1}/${processedRegions.length} (concepts: ${region.concepts.map((c) => c.name).join(", ")})`,
        );
        // the change would be done here
        const resolved = resolveRegionConceptsKeepBoth(region);
        console.log(
          `   → After resolution: ${resolved.concepts.map((c) => c.name).join(", ")}`,
        );
        return resolved;
      });

      // Filter out regions with no valid concepts
      const finalRegions = resolvedRegions.filter((r) => r.concepts.length > 0);

      console.log(`\n📊 [CLARIFAI] Final results:`);
      console.log(`   Raw regions: ${regions.length}`);
      console.log(`   After processing: ${processedRegions.length}`);
      console.log(`   After resolution: ${resolvedRegions.length}`);
      console.log(`   Final valid regions: ${finalRegions.length}`);

      if (finalRegions.length > 0) {
        console.log(
          `   Final region concepts:`,
          finalRegions
            .map(
              (r, i) =>
                `#${i + 1}:[${r.concepts.map((c) => c.name).join(",")}]`,
            )
            .join(" "),
        );
      } else {
        console.warn(
          `   ⚠️  WARNING: No valid regions after filtering! This might indicate:`,
        );
        console.warn(`     - Dress/one-piece items not in CATEGORY_MAP`);
        console.warn(`     - All concepts were filtered out during processing`);
        console.warn(`     - Region resolution removed all concepts`);
      }

      return {
        success: true,
        message: "Clothing detection completed successfully",
        regions: finalRegions,
        totalRegions: finalRegions.length,
      };
    } catch (error) {
      console.error(`\n❌ [CLARIFAI] Clothing detection failed`);
      console.error(`   Error type: ${error?.constructor?.name || "Unknown"}`);
      console.error(
        `   Error message: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.error(
        `   Error stack:`,
        error instanceof Error ? error.stack : "No stack trace",
      );

      return {
        success: false,
        message: `Error during clothing detection: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        regions: [],
        totalRegions: 0,
      };
    }
  }
}

function computeIoU(a: BoundingBox, b: BoundingBox): number {
  const xA = Math.max(a.leftCol, b.leftCol);
  const yA = Math.max(a.topRow, b.topRow);
  const xB = Math.min(a.rightCol, b.rightCol);
  const yB = Math.min(a.bottomRow, b.bottomRow);

  const intersection = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  if (intersection === 0) return 0;

  const areaA = (a.rightCol - a.leftCol) * (a.bottomRow - a.topRow);
  const areaB = (b.rightCol - b.leftCol) * (b.bottomRow - b.topRow);

  return intersection / (areaA + areaB - intersection);
}

const IOU_THRESHOLD = 0.6;
const CONFIDENCE_THRESHOLD = 10; // percent difference

/**
 * Variant of resolveRegionConcepts that keeps BOTH outerwear and top
 * when they co-exist in the same region, instead of picking one.
 * Swap this in place of resolveRegionConcepts at the call site to enable the behaviour.
 */
function resolveRegionConceptsKeepBoth(region: ClothingRegion): ClothingRegion {
  const concepts = region.concepts;

  const onePiece = concepts.find((c) => c.name === "onePiece");
  const outerwear = concepts.find((c) => c.name === "outerwear");
  const top = concepts.find((c) => c.name === "top");
  const bottom = concepts.find((c) => c.name === "bottom");
  const shoe = concepts.find((c) => c.name === "shoe");

  console.log(
    `     [RESOLVE-KEEP-BOTH] Input concepts: ${concepts.map((c) => `${c.name}:${c.confidence}%`).join(", ")}`,
  );
  console.log(
    `     [RESOLVE-KEEP-BOTH] Detected types: onePiece=${!!onePiece}, top=${!!top}, bottom=${!!bottom}, outerwear=${!!outerwear}, shoe=${!!shoe}`,
  );

  // RULE 1 — One-piece removes top + bottom clutter
  if (onePiece) {
    console.log(
      `     [RESOLVE-KEEP-BOTH] ✅ RULE 1 APPLIED: Found onePiece, keeping only that (removing ${concepts.length - 1} other concepts)`,
    );
    return {
      ...region,
      concepts: [onePiece],
    };
  }

  // RULE 2 — Outerwear + Top both present → keep both (no either-or)
  if (outerwear && top) {
    console.log(
      `     [RESOLVE-KEEP-BOTH] Outerwear + Top both detected — keeping both`,
    );
    console.log(`       - Outerwear confidence: ${outerwear.confidence}%`);
    console.log(`       - Top confidence: ${top.confidence}%`);

    const kept = [outerwear, top, bottom, shoe].filter(
      Boolean,
    ) as typeof concepts;
    console.log(
      `     [RESOLVE-KEEP-BOTH] ✅ RULE 2 APPLIED: Keeping [${kept.map((c) => c.name).join(", ")}]`,
    );
    return {
      ...region,
      concepts: kept,
    };
  }

  // Otherwise, keep all valid filtered concepts
  console.log(
    `     [RESOLVE-KEEP-BOTH] No rules applied, keeping all ${concepts.length} concepts`,
  );
  return region;
}

function resolveRegionConcepts(region: ClothingRegion): ClothingRegion {
  const concepts = region.concepts;

  const onePiece = concepts.find((c) => c.name === "onePiece");
  const top = concepts.find((c) => c.name === "top");
  const bottom = concepts.find((c) => c.name === "bottom");
  const outerwear = concepts.find((c) => c.name === "outerwear");
  const shoe = concepts.find((c) => c.name === "shoe");

  console.log(
    `     [RESOLVE] Input concepts: ${concepts.map((c) => `${c.name}:${c.confidence}%`).join(", ")}`,
  );
  console.log(
    `     [RESOLVE] Detected types: onePiece=${!!onePiece}, top=${!!top}, bottom=${!!bottom}, outerwear=${!!outerwear}, shoe=${!!shoe}`,
  );

  // RULE 1 — One-piece removes top + bottom clutter
  if (onePiece) {
    console.log(
      `     [RESOLVE] ✅ RULE 1 APPLIED: Found onePiece, keeping only that (removing ${concepts.length - 1} other concepts)`,
    );
    return {
      ...region,
      concepts: [onePiece],
    };
  }

  // RULE 2 — Outerwear vs Top based on overlap + confidence
  if (outerwear && top) {
    const diff = Math.abs(outerwear.confidence - top.confidence);
    const overlap = computeIoU(region.boundingBox, region.boundingBox); // same region box

    console.log(`     [RESOLVE] Outerwear vs Top detected:`);
    console.log(`       - Outerwear confidence: ${outerwear.confidence}%`);
    console.log(`       - Top confidence: ${top.confidence}%`);
    console.log(`       - Confidence diff: ${diff}%`);
    console.log(`       - IoU overlap: ${overlap.toFixed(3)}`);
    console.log(
      `       - Thresholds: diff<=${CONFIDENCE_THRESHOLD}%, IoU>=${IOU_THRESHOLD}`,
    );

    if (diff <= CONFIDENCE_THRESHOLD && overlap >= IOU_THRESHOLD) {
      console.log(
        `     [RESOLVE] ✅ RULE 2 APPLIED: Keeping outerwear, removing top`,
      );
      // Keep only outerwear
      return {
        ...region,
        concepts: [outerwear, bottom].filter(Boolean),
      };
    } else {
      console.log(
        `     [RESOLVE] ⏭️  RULE 2 NOT APPLIED: Confidence/overlap thresholds not met`,
      );
    }
  }

  // Otherwise, keep all valid filtered concepts
  console.log(
    `     [RESOLVE] No rules applied, keeping all ${concepts.length} concepts`,
  );
  return region;
}
