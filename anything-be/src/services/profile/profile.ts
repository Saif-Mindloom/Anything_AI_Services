import { calculateAge } from "../../helpers/utils";
import { User } from "../../models";
import { IdUrlPair } from "../home/home";
import {
  getUserWardrobeDetailsById,
  UserWardrobeDetails,
} from "../wardrobe/wardrobe";

export interface UserDetails {
  name: string;
  dob: string;
  height: number;
  weight: number;
  faceImages: string[];
  bodyImages: string[];
  baseModelUrl: string;
}

export interface UserProfileDetails {
  name: string;
  age: number;
  dob: string;
  weight: number;
  height: number;
  email: string;
  gender: string;
  mainLandingImage: string;
  wardrobeDetails: UserWardrobeDetails;
  status: string;
}

export const getUserProfileDetailsById = async (
  id: number
): Promise<UserProfileDetails> => {
  try {
    const user = await User.findByPk(id);

    if (!user) {
      throw new Error("User not found");
    }

    const age = calculateAge(user.dob);
    console.log("age", age);

    const wardrobeDetails: UserWardrobeDetails =
      await getUserWardrobeDetailsById(id);

    // const status = user.profileCompleted ? "completed" : "incomplete";

    const returnDetails: UserProfileDetails = {
      name: user.name,
      age: age,
      dob: user.dob || "",
      weight: user.weight,
      height: user.height,
      email: user.email,
      gender: user.gender || "",
      mainLandingImage: user.baseModelUrl,
      wardrobeDetails: wardrobeDetails,
      status: "success",
    };

    return returnDetails;
  } catch (error) {
    console.error("Error fetching user profile details:", error);
    throw error;
  }
};
