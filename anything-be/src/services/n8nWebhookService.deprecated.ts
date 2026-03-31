import axios from "axios";
import FormData from "form-data";
import { Outfit } from "../models/outfit.model";

/**
 * Service to interact with n8n webhooks
 */

interface RatingWebhookInput {
  sessionId: string;
  chatInput: string;
  image: string; // URL of the image
}

interface RatingWebhookResponse {
  output: string; // The rating value as string (e.g., "6.8")
}

/**
 * Call the n8n rating webhook to get an outfit rating
 */
export async function callRatingWebhook(
  input: RatingWebhookInput,
): Promise<number> {
  try {
    const webhookUrl =
      process.env.N8N_RATING_WEBHOOK_URL ||
      "http://host.docker.internal:5678/webhook/rating";

    console.log(`📊 Calling rating webhook for session: ${input.sessionId}`);

    // Download the image to send as form data
    const imageResponse = await axios.get(input.image, {
      responseType: "arraybuffer",
    });
    const imageBuffer = Buffer.from(imageResponse.data);

    // Create form data
    const formData = new FormData();
    formData.append("sessionId", input.sessionId);
    formData.append("chatInput", input.chatInput);
    formData.append("image", imageBuffer, {
      filename: "model.jpg",
      contentType: "image/jpeg",
    });

    // Make the request
    const response = await axios.post<RatingWebhookResponse>(
      webhookUrl,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
        },
        timeout: 60000, // 60 second timeout
      },
    );

    console.log(`✅ Rating webhook response:`, response.data);

    // Parse the rating value
    const ratingValue = parseFloat(response.data.output);

    if (isNaN(ratingValue)) {
      throw new Error(`Invalid rating value received: ${response.data.output}`);
    }

    return ratingValue;
  } catch (error) {
    console.error("❌ Error calling rating webhook:", error);
    if (axios.isAxiosError(error)) {
      console.error("Response data:", error.response?.data);
      console.error("Response status:", error.response?.status);
    }
    throw error;
  }
}

/**
 * Generate a rating for an outfit and store it in the database
 */
export async function generateAndStoreOutfitRating(
  outfitId: number,
  userId: string,
): Promise<number> {
  try {
    // Get the outfit
    const outfit = await Outfit.findOne({ where: { id: outfitId } });

    if (!outfit) {
      throw new Error(`Outfit ${outfitId} not found`);
    }

    // Get the 90-degree image (front-facing view) for rating
    let imageUrl: string;

    if (outfit.imageList && typeof outfit.imageList === "object") {
      const imageList = outfit.imageList as { [key: string]: string };
      imageUrl = imageList["90"] || outfit.primaryImageUrl || "";
    } else {
      imageUrl = outfit.primaryImageUrl || "";
    }

    if (!imageUrl) {
      throw new Error(`No image available for outfit ${outfitId}`);
    }

    console.log(
      `🎯 Generating rating for outfit ${outfitId} using image: ${imageUrl}`,
    );

    // Call the rating webhook
    const rating = await callRatingWebhook({
      sessionId: `outfit-${outfitId}-${Date.now()}`,
      chatInput: "Give me a rating for this outfit",
      image: imageUrl,
    });

    // Update the outfit with the rating
    await outfit.update({ rating });

    console.log(`✅ Stored rating ${rating} for outfit ${outfitId}`);

    return rating;
  } catch (error) {
    console.error(`❌ Error generating rating for outfit ${outfitId}:`, error);
    throw error;
  }
}
