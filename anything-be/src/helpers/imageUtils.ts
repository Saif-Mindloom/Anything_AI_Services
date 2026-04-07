import sharp from "sharp";

function shouldSaveDebugImagesByDefault(): boolean {
  // Prefer a VTO-specific switch when provided.
  if (typeof process.env.VTO_SAVE_DEBUG_IMAGES === "string") {
    return process.env.VTO_SAVE_DEBUG_IMAGES === "true";
  }
  // Fallback to existing global debug flag used elsewhere.
  if (typeof process.env.SAVE_DEBUG_IMAGES === "string") {
    return process.env.SAVE_DEBUG_IMAGES === "true";
  }
  // Preserve existing behavior when no env is configured.
  return true;
}

async function drawDebugBoundingBoxes(
  imageBuffer: Buffer,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  personCenterX: number,
  personCenterY: number,
  targetWidth: number,
  targetHeight: number,
): Promise<Buffer> {
  try {
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return imageBuffer;
    }

    const width = metadata.width;
    const height = metadata.height;

    const personWidth = maxX - minX;
    const personHeight = maxY - minY;
    const desiredPersonWidth = targetWidth * 0.7;
    const desiredPersonHeight = targetHeight * 0.8;
    const scaleX = desiredPersonWidth / personWidth;
    const scaleY = desiredPersonHeight / personHeight;
    const scale = Math.min(scaleX, scaleY);

    const svg = `
      <svg width="${width}" height="${height}">
        <!-- Detected person bounding box (RED) -->
        <rect x="${minX}" y="${minY}" 
              width="${personWidth}" height="${personHeight}" 
              fill="none" stroke="red" stroke-width="3" />
        
        <!-- Person center crosshair (GREEN) -->
        <line x1="${personCenterX - 20}" y1="${personCenterY}" 
              x2="${personCenterX + 20}" y2="${personCenterY}" 
              stroke="lime" stroke-width="3" />
        <line x1="${personCenterX}" y1="${personCenterY - 20}" 
              x2="${personCenterX}" y2="${personCenterY + 20}" 
              stroke="lime" stroke-width="3" />
        <circle cx="${personCenterX}" cy="${personCenterY}" r="5" fill="lime" />
        
        <!-- Target size box (YELLOW) - showing what size person should be -->
        <rect x="${personCenterX - desiredPersonWidth / 2}" 
              y="${personCenterY - desiredPersonHeight / 2}" 
              width="${desiredPersonWidth}" 
              height="${desiredPersonHeight}" 
              fill="none" stroke="yellow" stroke-width="3" stroke-dasharray="10,5" />
        
        <!-- Info text -->
        <rect x="10" y="10" width="400" height="180" fill="black" fill-opacity="0.7" />
        <text x="20" y="35" font-family="Arial" font-size="16" fill="white" font-weight="bold">
          🔍 DETECTION DEBUG
        </text>
        <text x="20" y="60" font-family="Arial" font-size="14" fill="red">
          RED BOX: Detected person
        </text>
        <text x="20" y="80" font-family="Arial" font-size="14" fill="lime">
          GREEN +: Person center
        </text>
        <text x="20" y="100" font-family="Arial" font-size="14" fill="yellow">
          YELLOW BOX: Target size
        </text>
        <text x="20" y="125" font-family="Arial" font-size="14" fill="white">
          Detected: ${personWidth}×${personHeight}px
        </text>
        <text x="20" y="145" font-family="Arial" font-size="14" fill="white">
          Target: ${Math.round(desiredPersonWidth)}×${Math.round(
            desiredPersonHeight,
          )}px
        </text>
        <text x="20" y="165" font-family="Arial" font-size="14" fill="white">
          Scale: ${scale.toFixed(3)}x (scaleX:${scaleX.toFixed(
            2,
          )} scaleY:${scaleY.toFixed(2)})
        </text>
        <text x="20" y="185" font-family="Arial" font-size="14" fill="${
          scale < 0.5 ? "red" : scale > 1.5 ? "orange" : "lime"
        }">
          ${
            scale < 0.5
              ? "⚠️ WARNING: Scale too small!"
              : scale > 1.5
                ? "⚠️ WARNING: Scale too large!"
                : "✓ Scale looks good"
          }
        </text>
      </svg>
    `;

    const debugImage = await image
      .composite([
        {
          input: Buffer.from(svg),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();

    return debugImage;
  } catch (error) {
    console.error("Error drawing debug boxes:", error);
    return imageBuffer;
  }
}

export async function centerAndStandardizeImage(
  imageBuffer: Buffer,
  targetWidth: number = 1024,
  targetHeight: number = 1536,
  saveDebugImage?: boolean,
): Promise<Buffer> {
  try {
    const shouldSaveDebugImage =
      saveDebugImage ?? shouldSaveDebugImagesByDefault();
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      console.warn("Unable to determine image dimensions, returning original");
      return imageBuffer;
    }

    const { data, info } = await image
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let minX = info.width;
    let minY = info.height;
    let maxX = 0;
    let maxY = 0;

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

    if (minX >= maxX || minY >= maxY) {
      console.warn("No person detected in image, returning original");
      return imageBuffer;
    }

    const personWidth = maxX - minX;
    const personHeight = maxY - minY;
    const personCenterX = minX + personWidth / 2;
    const personCenterY = minY + personHeight / 2;

    console.log(
      `👤 Person detected: ${personWidth}x${personHeight} at center (${Math.round(
        personCenterX,
      )}, ${Math.round(personCenterY)})`,
    );

    const desiredPersonWidth = targetWidth * 0.7 * 1.2;
    const desiredPersonHeight = targetHeight * 0.8 * 1.2;

    console.log(
      `🎯 Target size: ${Math.round(desiredPersonWidth)}x${Math.round(
        desiredPersonHeight,
      )}`,
    );
    console.log(
      `   Person will be resized to fit within this box while maintaining aspect ratio`,
    );

    if (shouldSaveDebugImage) {
      try {
        const debugImageBuffer = await drawDebugBoundingBoxes(
          imageBuffer,
          minX,
          minY,
          maxX,
          maxY,
          personCenterX,
          personCenterY,
          targetWidth,
          targetHeight,
        );

        const fs = await import("fs/promises");
        const path = await import("path");
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const debugPath = path.join(
          process.cwd(),
          "generated-images",
          `debug-detection-${timestamp}.png`,
        );

        await fs.writeFile(debugPath, debugImageBuffer);
        console.log(`🐛 Debug image saved: ${debugPath}`);
      } catch (debugError) {
        console.warn(`Could not save debug image:`, debugError);
      }
    }

    const padding = Math.max(personWidth, personHeight) * 0.05;
    const cropLeft = Math.max(0, Math.floor(minX - padding));
    const cropTop = Math.max(0, Math.floor(minY - padding));
    const cropWidth = Math.min(
      Math.ceil(personWidth + padding * 2),
      info.width - cropLeft,
    );
    const cropHeight = Math.min(
      Math.ceil(personHeight + padding * 2),
      info.height - cropTop,
    );

    console.log(
      `✂️ Cropping person with padding: ${cropWidth}x${cropHeight} at (${cropLeft}, ${cropTop})`,
    );

    const croppedPersonImage = await sharp(imageBuffer)
      .extract({
        left: cropLeft,
        top: cropTop,
        width: cropWidth,
        height: cropHeight,
      })
      .toBuffer();

    const resizedPersonImage = await sharp(croppedPersonImage)
      .resize(Math.round(desiredPersonWidth), Math.round(desiredPersonHeight), {
        fit: "inside",
        background: { r: 240, g: 240, b: 240, alpha: 0 },
      })
      .toBuffer();

    const resizedMetadata = await sharp(resizedPersonImage).metadata();
    const resizedWidth = resizedMetadata.width || 0;
    const resizedHeight = resizedMetadata.height || 0;

    console.log(`📐 Resized person to: ${resizedWidth}x${resizedHeight}`);

    const finalOffsetX = Math.round((targetWidth - resizedWidth) / 2);
    const finalOffsetY = Math.round((targetHeight - resizedHeight) / 2);

    console.log(
      `🎯 Centering person on canvas at offset: (${finalOffsetX}, ${finalOffsetY})`,
    );

    const centeredImage = await sharp({
      create: {
        width: targetWidth,
        height: targetHeight,
        channels: 4,
        background: { r: 240, g: 240, b: 240, alpha: 0 },
      },
    } as any)
      .composite([
        {
          input: resizedPersonImage,
          left: finalOffsetX,
          top: finalOffsetY,
        },
      ])
      .png()
      .toBuffer();

    console.log(
      `✅ Image standardized to ${targetWidth}x${targetHeight} with centered person`,
    );

    return centeredImage;
  } catch (error) {
    console.error("Error in centerAndStandardizeImage:", error);
    console.warn("Returning original image due to centering error");
    return imageBuffer;
  }
}
