import express from "express";
import multer from "multer";
import OpenAI from "openai";
import { GoogleGenAI, Modality } from "@google/genai";
import sharp from "sharp";
import { removeBackgroundFromBase64 } from "../services/backgroundRemovalService";
import { centerAndStandardizeImage } from "../helpers/imageUtils";
import { Apparel } from "../models/apparel.model";
import { getUserFromToken } from "../helpers/utils";
import { gcsService } from "../services/gcsService";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed") as any, false);
    }
  },
});

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const gemini = new GoogleGenAI({
  apiKey:
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    "AIzaSyB_m0qCgrF1GGFXnY7DmOEXHwDtnBVEhlY",
});

type BoundingBox = [[number, number], [number, number]];

interface AccessoryDetection {
  itemName: string;
  category: string;
  description: string;
  location: string;
  boundingBoxCoords: BoundingBox;
}

const detectionSystemPrompt = `Fashion Accessory Detector

Role: You are a highly specialized Fashion Accessory Recognition Expert. Your sole purpose is to identify and catalog specific wearable accessories and headwear from images.

Scope of Work:
You must only detect and report items from the following Allowed Categories. If an item is not on this list (for example shirts, pants, shoes, vests), ignore it entirely.

Allowed Categories:
- Headwear: Hats, Headscarves, Hairbands
- Eyewear: Glasses, Sunglasses
- Jewelry: Necklaces, Chains, Bracelets, Rings, Earrings
- Wristwear: Watches
- Waistwear: Belts
- Bags: Handbags (including clutches, totes, crossbody bags, satchels)

Operational Rules:
- Strict Filtering: Do not mention primary clothing items (tops, bottoms, outerwear)
- Granularity: Specify subtype when possible (for example leather tote instead of bag)
- Attributes: For every detected item include color, material if identifiable, style, and placement on body
- Bounding Box: Include absolute pixel coordinates for bounding box in format [[x1,y1],[x2,y2]]

Negative Constraints:
- If no accessories are present, respond with exactly: "No allowed accessories detected."

Output Format:
- Return ONLY valid JSON, no markdown
- If accessories exist, return an array with objects in this shape:
[
  {
    "Item Name": "Belt",
    "Category": "Waistwear",
    "Description": "Black leather belt with silver buckle",
    "Location": "Waist",
    "BoundingBoxCoords": [[200,600],[1400,950]]
  }
]`;

function stripCodeFence(input: string): string {
  const text = input.trim();
  if (!text.startsWith("```")) return text;
  return text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString("base64")}`;
}

function toFileSlug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function parseMaybeNonJsonBoundingBoxes(text: string): string {
  return text
    .replace(/\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/g, "[$1,$2]")
    .replace(/\"BoundingBoxCoords\"\s*:\s*\[\s*\[/g, '"BoundingBoxCoords": [[')
    .replace(/\]\s*,\s*\[/g, "],[");
}

function parseDetections(raw: string): AccessoryDetection[] {
  const cleaned = stripCodeFence(raw);

  if (cleaned === "No allowed accessories detected.") {
    return [];
  }

  const parsedText = parseMaybeNonJsonBoundingBoxes(cleaned);
  const parsed = JSON.parse(parsedText);

  if (!Array.isArray(parsed)) {
    throw new Error("Detection response is not a JSON array");
  }

  return parsed
    .map((item: any) => {
      const box = item.BoundingBoxCoords;
      if (
        !Array.isArray(box) ||
        box.length !== 2 ||
        !Array.isArray(box[0]) ||
        !Array.isArray(box[1]) ||
        box[0].length !== 2 ||
        box[1].length !== 2
      ) {
        return null;
      }

      return {
        itemName: String(item["Item Name"] || item.itemName || "Accessory"),
        category: String(item.Category || item.category || "Unknown"),
        description: String(item.Description || item.description || ""),
        location: String(item.Location || item.location || "Unknown"),
        boundingBoxCoords: [
          [Number(box[0][0]), Number(box[0][1])],
          [Number(box[1][0]), Number(box[1][1])],
        ] as BoundingBox,
      };
    })
    .filter(
      (item: AccessoryDetection | null): item is AccessoryDetection => !!item,
    );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizeDetections(
  detections: AccessoryDetection[],
  width: number,
  height: number,
): AccessoryDetection[] {
  return detections
    .map((det) => {
      const x1 = clamp(Math.round(det.boundingBoxCoords[0][0]), 0, width - 1);
      const y1 = clamp(Math.round(det.boundingBoxCoords[0][1]), 0, height - 1);
      const x2 = clamp(Math.round(det.boundingBoxCoords[1][0]), 0, width - 1);
      const y2 = clamp(Math.round(det.boundingBoxCoords[1][1]), 0, height - 1);

      const left = Math.min(x1, x2);
      const right = Math.max(x1, x2);
      const top = Math.min(y1, y2);
      const bottom = Math.max(y1, y2);

      if (right - left < 8 || bottom - top < 8) {
        return null;
      }

      return {
        ...det,
        boundingBoxCoords: [
          [left, top],
          [right, bottom],
        ],
      };
    })
    .filter(
      (item: AccessoryDetection | null): item is AccessoryDetection => !!item,
    );
}

async function drawDetectionOverlay(
  imageBuffer: Buffer,
  detections: AccessoryDetection[],
): Promise<Buffer> {
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  const colors = ["#ff3b30", "#007aff", "#34c759", "#ff9500", "#af52de"];

  const rects = detections
    .map((det, idx) => {
      const [[x1, y1], [x2, y2]] = det.boundingBoxCoords;
      const color = colors[idx % colors.length];
      return `
        <rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="none" stroke="${color}" stroke-width="4" />
        <rect x="${x1}" y="${Math.max(0, y1 - 26)}" width="320" height="24" fill="${color}" fill-opacity="0.9" />
        <text x="${x1 + 8}" y="${Math.max(16, y1 - 9)}" font-family="Arial" font-size="14" fill="white" font-weight="bold">
          ${idx + 1}. ${det.itemName} (${det.category})
        </text>
      `;
    })
    .join("\n");

  const svg = `
    <svg width="${width}" height="${height}">
      ${rects}
    </svg>
  `;

  return sharp(imageBuffer)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function trimTransparentPadding(imageBuffer: Buffer): Promise<Buffer> {
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height) {
    return imageBuffer;
  }

  const { data, info } = await image
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      const alpha = data[idx + 3];
      if (alpha > 25) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return imageBuffer;
  }

  return sharp(imageBuffer)
    .extract({
      left: minX,
      top: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    })
    .png()
    .toBuffer();
}

async function generateStudioAccessoryImage(
  originalImageDataUrl: string,
  detection: AccessoryDetection,
): Promise<Buffer> {
  const prompt = `Given the provided original fashion photo and this detection object, generate ONE standalone studio-quality product image of ONLY the detected accessory.

Detection JSON:
${JSON.stringify(
  {
    "Item Name": detection.itemName,
    Category: detection.category,
    Description: detection.description,
    Location: detection.location,
    BoundingBoxCoords: detection.boundingBoxCoords,
  },
  null,
  2,
)}

Requirements:
- Preserve the accessory's style, color, and material from the original photo
- Focus tightly on only this accessory item
- Keep a professional studio product photography look
- Plain white or very light neutral background
- No person, no body parts, no mannequin
- High detail, sharp focus

Return ONLY the final generated image.`;

  const [header, base64Data] = originalImageDataUrl.split(",");
  const mimeType = header.match(/data:(.*?);base64/)?.[1] || "image/jpeg";

  const response = await gemini.models.generateContent({
    model: "gemini-2.5-flash-image",
    contents: [
      { text: prompt },
      {
        inlineData: {
          mimeType,
          data: base64Data,
        },
      },
    ],
    config: {
      responseModalities: [Modality.IMAGE, Modality.TEXT],
    },
  });

  for (const candidate of response.candidates ?? []) {
    const imagePart = candidate.content?.parts?.find(
      (part: any) => part.inlineData,
    );
    if (imagePart?.inlineData?.data) {
      return Buffer.from(imagePart.inlineData.data, "base64");
    }
  }

  throw new Error(
    "Gemini did not return an image for combined accessory generation",
  );
}

router.post(
  "/detect-and-generate-accessories",
  upload.single("image"),
  async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({
          success: false,
          message: "OPENAI_API_KEY is missing in environment",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "Image file is required in form-data field 'image'",
        });
      }

      const authHeader = req.headers?.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          success: false,
          message: "Authentication required. Please provide a valid token.",
        });
      }

      const token = authHeader.substring(7);
      const userFromToken = await getUserFromToken(token);
      if (!userFromToken?.userId) {
        return res.status(401).json({
          success: false,
          message: "Invalid or expired token",
        });
      }

      const userId = Number(userFromToken.userId);

      const inputMime = req.file.mimetype || "image/jpeg";
      const inputDataUrl = toDataUrl(req.file.buffer, inputMime);

      const metadata = await sharp(req.file.buffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;

      if (!width || !height) {
        return res.status(400).json({
          success: false,
          message: "Could not read input image dimensions",
        });
      }

      const detectResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: detectionSystemPrompt,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Detect allowed accessories from this image. Image dimensions are ${width}x${height}. Bounding boxes must be absolute pixel coordinates in this image space.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: inputDataUrl,
                  detail: "high",
                },
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1200,
      });

      const rawDetectionOutput =
        detectResponse.choices[0]?.message?.content?.trim() || "";

      if (rawDetectionOutput === "No allowed accessories detected.") {
        return res.json({
          success: true,
          message: "No allowed accessories detected.",
          detections: [],
          generatedAccessories: [],
        });
      }

      const parsedDetections = parseDetections(rawDetectionOutput);
      const detections = sanitizeDetections(parsedDetections, width, height);

      if (detections.length === 0) {
        return res.json({
          success: true,
          message: "No allowed accessories detected.",
          detections: [],
          generatedAccessories: [],
          rawDetectionOutput,
        });
      }

      const timestamp = Date.now();
      const gcsFolder = "Accessories/Detected";
      const inputUpload = await gcsService.uploadFile(
        req.file.buffer,
        `input-${timestamp}.png`,
        userId.toString(),
        gcsFolder,
        "image/png",
      );

      const overlayBuffer = await drawDetectionOverlay(
        req.file.buffer,
        detections,
      );
      const overlayUpload = await gcsService.uploadFile(
        overlayBuffer,
        `detections-overlay-${timestamp}.png`,
        userId.toString(),
        gcsFolder,
        "image/png",
      );

      const generatedAccessories = [] as Array<{
        itemName: string;
        category: string;
        description: string;
        location: string;
        boundingBoxCoords: BoundingBox;
        apparelId: number;
        extractedImageUrl: string;
        finalCroppedImageUrl: string;
      }>;

      for (let i = 0; i < detections.length; i++) {
        const detection = detections[i];
        const itemSlug = toFileSlug(detection.itemName) || "accessory";
        const fileStamp = Date.now();

        const generatedBuffer = await generateStudioAccessoryImage(
          inputDataUrl,
          detection,
        );

        const generatedUpload = await gcsService.uploadFile(
          generatedBuffer,
          `generated-${i + 1}-${itemSlug}-${fileStamp}.png`,
          userId.toString(),
          gcsFolder,
          "image/png",
        );

        const generatedDataUrl = toDataUrl(generatedBuffer, "image/png");
        const bgRemovedDataUrl = await removeBackgroundFromBase64(
          generatedDataUrl,
          {
            background: "transparent",
          },
        );
        const bgRemovedBase64 =
          bgRemovedDataUrl.split(",")[1] || bgRemovedDataUrl;
        const bgRemovedBuffer = Buffer.from(bgRemovedBase64, "base64");

        const bgRemovedUpload = await gcsService.uploadFile(
          bgRemovedBuffer,
          `bg-removed-${i + 1}-${itemSlug}-${fileStamp}.png`,
          userId.toString(),
          gcsFolder,
          "image/png",
        );

        const finalCroppedBuffer =
          await trimTransparentPadding(bgRemovedBuffer);
        const finalStandardizedBuffer = await centerAndStandardizeImage(
          finalCroppedBuffer,
          512,
          512,
          false,
        );

        const finalUpload = await gcsService.uploadFile(
          finalStandardizedBuffer,
          `final-${i + 1}-${itemSlug}-${fileStamp}.png`,
          userId.toString(),
          gcsFolder,
          "image/png",
        );

        const apparel = await Apparel.create({
          userId,
          category: "accessory",
          subcategory: "other",
          brand: "Unknown Brand",
          name: detection.itemName,
          status: "complete",
          description: detection.description,
          material: "Cotton",
          colors: {
            colorname: "Unknown",
            colorvalue: "#808080",
          },
          favorite: false,
          urlRaw: bgRemovedUpload.httpUrl,
          urlProcessed: finalUpload.httpUrl,
          originalUploadedImageUrl: inputUpload.httpUrl,
        });

        generatedAccessories.push({
          itemName: detection.itemName,
          category: detection.category,
          description: detection.description,
          location: detection.location,
          boundingBoxCoords: detection.boundingBoxCoords,
          apparelId: apparel.id,
          extractedImageUrl: bgRemovedUpload.httpUrl,
          finalCroppedImageUrl: finalUpload.httpUrl,
        });
      }

      return res.json({
        success: true,
        message: `Processed ${detections.length} detected item(s), generated ${generatedAccessories.length} accessory image(s) with per-item generation flow`,
        detections,
        rawDetectionOutput,
        savedLinks: {
          inputImageUrl: inputUpload.httpUrl,
          detectionOverlayUrl: overlayUpload.httpUrl,
          gcsFolder,
        },
        apparelPersistence: {
          savedCount: generatedAccessories.length,
          userId,
          category: "accessory",
        },
        generatedAccessories,
      });
    } catch (error) {
      console.error("❌ Error in detect-and-generate-accessories flow:", error);
      return res.status(500).json({
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to detect and generate accessories",
      });
    }
  },
);

export default router;
