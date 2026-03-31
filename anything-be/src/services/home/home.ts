import { Op } from "sequelize";
import { User } from "../../models";
import { Outfit } from "../../models/outfit.model";
import { Apparel } from "../../models/apparel.model";
import { CalendarEntry } from "../../models/calendarEntry.model";
import {
  getUserApparelsQuery,
  getUserRecentlyAddedApparelsQuery,
} from "../apparelService";
import { getAnythingPickWithOutfit } from "../anythingPickService";

// MODELS / TYPES

export interface IdUrlPair {
  id: number;
  url: string;
}

export interface MainLandingImage {
  outfitId: number;
  url: string;
  angle: string;
}

interface AnythingPick {
  outfit: IdUrlPair | null;
  outfitSummary: string | null;
  top: IdUrlPair | null;
  bottom: IdUrlPair | null;
  shoes: IdUrlPair | null;
}

interface OutfitCalendarItem {
  date: string;
  outfit: IdUrlPair | null;
}

export interface UserHomePageDetails {
  baseModelUrl: string;
  baseModelGsUtil: string | null;
  savedLooks: IdUrlPair[];
  outfitCalendar: OutfitCalendarItem[];
  anythingPick: AnythingPick;
  recentlyAddedApparel: IdUrlPair[];
  status: string;
}

export interface MainLandingImagesResponse {
  mainLandingImages: MainLandingImage[];
  status: string;
}

export const getMainLandingImagesById = async (
  userId: number,
): Promise<MainLandingImagesResponse> => {
  try {
    console.log(`Fetching main landing images for user: ${userId}`);

    const user = await User.findByPk(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // Fetch visible outfits (same as in getUserHomePageDetailsById)
    const visibleOutfits = await Outfit.findAll({
      where: {
        userId: userId,
        visible: true,
      },
      order: [["updatedAt", "DESC"]],
    });

    // Get top 3 outfits for main landing images with specific angles
    const mainLandingImages: MainLandingImage[] = [];

    if (visibleOutfits.length >= 3) {
      const top3Outfits = visibleOutfits.slice(0, 3);
      const angleMapping = [
        { degree: "90", label: "90° (Front View)" },
        { degree: "45", label: "45° (Three-Quarter Right)" },
        { degree: "135", label: "135° (Three-Quarter Left)" },
      ];

      top3Outfits.forEach((outfit, index) => {
        const angleConfig = angleMapping[index];
        const imageList = outfit.imageList as Record<string, string> | null;

        if (imageList && imageList[angleConfig.degree]) {
          mainLandingImages.push({
            outfitId: Number(outfit.id),
            url: imageList[angleConfig.degree],
            angle: angleConfig.label,
          });
        }
      });
    }

    return {
      mainLandingImages,
      status: "success",
    };
  } catch (error) {
    console.error("Error fetching main landing images:", error);
    throw error;
  }
};

export const getUserHomePageDetailsById = async (
  userId: number,
): Promise<UserHomePageDetails> => {
  try {
    console.log(`Fetching homepage details for user: ${userId}`);

    const user = await User.findByPk(userId);

    if (!user) {
      throw new Error("User not found");
    }

    // REAL READ
    const baseModelUrl: string = user.baseModelUrl;
    const baseModelGsUtil: string | null = user.gsUtil || null;
    const recentlyAddedApparel: IdUrlPair[] =
      await getUserRecentlyAddedApparelsQuery({ userId: userId });

    // Fetch saved looks (outfits where visible = true)
    const visibleOutfits = await Outfit.findAll({
      where: {
        userId: userId,
        visible: true,
      },
      order: [["updatedAt", "DESC"]],
    });

    const savedLooks: IdUrlPair[] = visibleOutfits
      .filter((outfit) => outfit.primaryImageUrl) // Only include outfits with images
      .map((outfit) => ({
        id: Number(outfit.id),
        url: outfit.primaryImageUrl!,
      }));

    // Get calendar outfits for today and next 3 days (total 4 days)
    const outfitCalendar: OutfitCalendarItem[] = [];

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Reset time to start of day

      const day1 = new Date(today);
      const day2 = new Date(today);
      day2.setDate(day2.getDate() + 1);
      const day3 = new Date(today);
      day3.setDate(day3.getDate() + 2);
      const day4 = new Date(today);
      day4.setDate(day4.getDate() + 3);

      // Format dates as YYYY-MM-DD
      const dateStrings = [
        day1.toISOString().split("T")[0],
        day2.toISOString().split("T")[0],
        day3.toISOString().split("T")[0],
        day4.toISOString().split("T")[0],
      ];

      console.log(
        `🗓️ Fetching calendar entries for dates: ${dateStrings.join(", ")}`,
      );

      // Fetch calendar entries for these dates
      const calendarEntries = await CalendarEntry.findAll({
        where: {
          userId,
          date: {
            [Op.in]: dateStrings,
          },
        },
        order: [["date", "ASC"]],
      });

      console.log(`📅 Found ${calendarEntries.length} calendar entries`);

      // Create a map of date -> outfit for quick lookup
      const dateOutfitMap = new Map<string, { id: number; url: string }>();

      for (const entry of calendarEntries) {
        if (entry.outfitId) {
          const outfit = await Outfit.findByPk(entry.outfitId);

          if (outfit && outfit.primaryImageUrl) {
            dateOutfitMap.set(entry.date.toString(), {
              id: outfit.id,
              url: outfit.primaryImageUrl,
            });
            console.log(`✅ Found outfit ${outfit.id} for date ${entry.date}`);
          }
        }
      }

      // Add all 4 days to the calendar, with or without outfits
      for (const dateString of dateStrings) {
        const outfitData = dateOutfitMap.get(dateString);

        if (outfitData) {
          outfitCalendar.push({
            date: dateString,
            outfit: outfitData,
          });
        } else {
          outfitCalendar.push({
            date: dateString,
            outfit: null as any, // No outfit for this date
          });
        }
      }

      console.log(
        `✅ Prepared ${outfitCalendar.length} calendar days (${dateOutfitMap.size} with outfits)`,
      );
    } catch (error) {
      console.error("⚠️ Error fetching outfit calendar:", error);
      // Continue without calendar - it's optional
    }

    // Get today's Anything Pick
    const anythingPick: AnythingPick = {
      outfit: null,
      outfitSummary: null,
      top: null,
      bottom: null,
      shoes: null,
    };

    try {
      // Get user's location/weather if available (defaulting to casual for now)
      const pickResult = await getAnythingPickWithOutfit(userId);

      if (pickResult) {
        const { outfit, pick } = pickResult;

        // Set the outfit image (prefer 90° view if available)
        let outfitImageUrl = outfit.primaryImageUrl || "";
        if (outfit.imageList && typeof outfit.imageList === "object") {
          const imageList = outfit.imageList as Record<string, string>;
          outfitImageUrl = imageList["90"] || outfitImageUrl;
        }

        if (outfitImageUrl) {
          anythingPick.outfit = {
            id: outfit.id,
            url: outfitImageUrl,
          };
        }

        // Add outfit summary
        anythingPick.outfitSummary = outfit.outfitSummary || null;

        // Get individual item images
        if (outfit.topId && outfit.topId !== 0) {
          const top = await Apparel.findByPk(outfit.topId);
          if (top) {
            const topUrl = top.gsUtilProcessed || top.urlProcessed || null;
            if (topUrl) {
              anythingPick.top = {
                id: top.id,
                url: topUrl,
              };
            }
          }
        }

        if (outfit.bottomId && outfit.bottomId !== 0) {
          const bottom = await Apparel.findByPk(outfit.bottomId);
          if (bottom) {
            const bottomUrl =
              bottom.gsUtilProcessed || bottom.urlProcessed || null;
            if (bottomUrl) {
              anythingPick.bottom = {
                id: bottom.id,
                url: bottomUrl,
              };
            }
          }
        }

        if (outfit.shoeId && outfit.shoeId !== 0) {
          const shoes = await Apparel.findByPk(outfit.shoeId);
          if (shoes) {
            const shoesUrl =
              shoes.gsUtilProcessed || shoes.urlProcessed || null;
            if (shoesUrl) {
              anythingPick.shoes = {
                id: shoes.id,
                url: shoesUrl,
              };
            }
          }
        }

        console.log(
          `✅ Anything Pick selected: Outfit ${outfit.id} - ${pick.reason}`,
        );
      }
    } catch (error) {
      console.error("⚠️ Error fetching Anything Pick:", error);
      // Continue without Anything Pick - it's optional
    }

    return {
      baseModelUrl,
      baseModelGsUtil,
      savedLooks,
      outfitCalendar,
      anythingPick,
      recentlyAddedApparel,
      status: "success",
    };
  } catch (error) {
    console.error("Error fetching user homepage:", error);
    throw error;
  }
};
