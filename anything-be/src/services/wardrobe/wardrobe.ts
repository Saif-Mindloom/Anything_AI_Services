import { Apparel, Outfit } from "../../models";
import { IdUrlPair } from "../home/home";

export interface UserWardrobeDetails {
  looksCount: number;
  maxlimitApparels: number;
  itemsCount: number;
  looks: IdUrlPair[];
}

const maxlimitApparels = 250;

export const getUserWardrobeDetailsById = async (
  id: number,
): Promise<UserWardrobeDetails> => {
  try {
    const userOutfits = await Outfit.findAll({
      where: { userId: id, visible: true },
      order: [["createdAt", "DESC"]],
      // limit: maxLimitWardrobeItems,
    });

    const looksCount = userOutfits.length;

    const looks = userOutfits.map((outfit) => ({
      id: Number(outfit.id),
      url: outfit.primaryImageUrl,
    }));

    const userApparels = await Apparel.findAll({
      where: { userId: id },
      order: [["createdAt", "DESC"]],
      attributes: ["id"],
      // limit: maxLimitWardrobeItems,
    });

    const itemsCount = userApparels.length;

    const returnDetails: UserWardrobeDetails = {
      looksCount: looksCount,
      maxlimitApparels: maxlimitApparels,
      itemsCount: itemsCount,
      looks: looks,
    };

    return returnDetails;
  } catch (error) {
    console.error("Error fetching user profile details:", error);
    throw error;
  }
};
