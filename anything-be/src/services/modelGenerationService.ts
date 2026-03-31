import { generateModelImage } from "./gemini/services";
import { User } from "../models/index";
import { generateModelId } from "../helpers/utils";
import { gcsService } from "./gcsService";
import { removeBackgroundFromBase64 } from "./backgroundRemovalService";
import { centerAndStandardizeImage } from "../helpers/imageUtils";

export const regenerateModelForExistingUser = async (
  userId: string,
  bodyPhotoFiles: Express.Multer.File[],
  facePhotoFiles: Express.Multer.File[] = [],
): Promise<{ modelId: string; modelPhoto: string; status: string }> => {
  try {
    console.log(`Starting model regeneration for existing user ID: ${userId}`);

    // Validate that user exists in database
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error("User not found");
    }

    if (!bodyPhotoFiles || bodyPhotoFiles.length < 2) {
      throw new Error("At least 2 body photos are required");
    }

    // Get existing user data to reuse
    const { height, weight, gender, dob } = user;

    console.log(
      `Reusing existing user data: height=${height}, weight=${weight}, gender=${gender}, dob=${dob}`,
    );

    const modelId = generateModelId();

    await gcsService.ensureUserFolderExists(userId);

    const primaryBodyPhoto = bodyPhotoFiles[0];
    const secondaryBodyPhoto = bodyPhotoFiles[1];
    const imageBuffer = primaryBodyPhoto.buffer;
    const referenceImageBuffer = secondaryBodyPhoto.buffer;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rawImageUrls = [];

    console.log(`Uploading ${bodyPhotoFiles.length} raw body images to GCS...`);
    for (let i = 0; i < bodyPhotoFiles.length; i++) {
      try {
        const bodyPhotoFile = bodyPhotoFiles[i];
        const rawImageFileName = `raw-body-${
          i + 1
        }-${modelId}-${timestamp}.jpg`;

        const uploadResult = await gcsService.uploadFile(
          bodyPhotoFile.buffer,
          rawImageFileName,
          userId,
          "Avatar/Raw",
          bodyPhotoFile.mimetype,
        );

        rawImageUrls.push(uploadResult.httpUrl);
        console.log(
          `Raw body image ${i + 1} uploaded to: ${uploadResult.gsUri}`,
        );
      } catch (error) {
        console.error(`Error uploading raw body image ${i + 1}:`, error);
      }
    }

    const rawFaceImageUrls = [];
    if (facePhotoFiles && facePhotoFiles.length > 0) {
      console.log(
        `Uploading ${facePhotoFiles.length} raw face images to GCS...`,
      );
      for (let i = 0; i < facePhotoFiles.length; i++) {
        try {
          const facePhotoFile = facePhotoFiles[i];
          const rawFaceImageFileName = `raw-face-${
            i + 1
          }-${modelId}-${timestamp}.jpg`;

          const uploadResult = await gcsService.uploadFile(
            facePhotoFile.buffer,
            rawFaceImageFileName,
            userId,
            "Avatar/Raw",
            facePhotoFile.mimetype,
          );

          rawFaceImageUrls.push(uploadResult.httpUrl);
          console.log(
            `Raw face image ${i + 1} uploaded to: ${uploadResult.gsUri}`,
          );
        } catch (error) {
          console.error(`Error uploading raw face image ${i + 1}:`, error);
        }
      }
    }

    console.log(`Generating model image with existing user parameters`);
    const modelImageBase64 = await generateModelImage(
      imageBuffer,
      referenceImageBuffer,
      "image/jpeg",
      height || undefined,
      weight || undefined,
      gender || undefined,
    );

    // Apply background removal to the generated model image
    console.log(`Applying background removal to generated model...`);
    let processedModelImageBase64: string;
    try {
      processedModelImageBase64 = await removeBackgroundFromBase64(
        modelImageBase64,
        { background: "transparent" },
      );
      console.log(`Background removal completed successfully`);
    } catch (bgRemovalError) {
      console.warn(
        "Background removal failed, using original image:",
        bgRemovalError,
      );
      processedModelImageBase64 = modelImageBase64;
    }

    // Apply centering and standardization
    console.log(`Centering and standardizing model image...`);
    try {
      const base64Data = processedModelImageBase64.includes(",")
        ? processedModelImageBase64.split(",")[1]
        : processedModelImageBase64;
      const processedBuffer = Buffer.from(base64Data, "base64");
      const centeredBuffer = await centerAndStandardizeImage(
        processedBuffer,
        1024,
        1536,
        false,
      );
      processedModelImageBase64 = centeredBuffer.toString("base64");
      console.log(`Image centering completed successfully`);
    } catch (centerError) {
      console.warn(
        "Image centering failed, using background-removed image:",
        centerError,
      );
    }

    const modelFileName = `model-${modelId}-${timestamp}.png`;

    console.log(`Uploading processed model to GCS...`);
    const uploadResult = await gcsService.uploadBase64Image(
      processedModelImageBase64,
      modelFileName,
      userId,
      "Avatar/Processed",
      "image/png",
    );
    const gcsUrl = uploadResult.httpUrl;

    // Update the user record - replace old images with new ones
    await User.update(
      {
        faceImages: rawFaceImageUrls.length > 0 ? rawFaceImageUrls : [],
        bodyImages: {
          rawImageUrls: rawImageUrls,
        },
        baseModelUrl: gcsUrl,
      },
      {
        where: { id: user.id },
      },
    );

    console.log(
      `Model regeneration completed for user ID: ${userId}, modelId: ${modelId}`,
    );
    console.log(`New raw body images saved: ${rawImageUrls.join(", ")}`);
    if (rawFaceImageUrls.length > 0) {
      console.log(`New raw face images saved: ${rawFaceImageUrls.join(", ")}`);
    }
    console.log(`New generated model saved to: ${uploadResult.gsUri}`);

    return {
      modelId,
      modelPhoto: gcsUrl,
      status: "Model regenerated and saved successfully",
    };
  } catch (error) {
    console.error("Error in model regeneration for existing user:", error);

    throw new Error(
      `Model regeneration failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
};
