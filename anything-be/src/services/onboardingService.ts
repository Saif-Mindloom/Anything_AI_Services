import { User } from "../models/index";

export interface OnboardingStatus {
  profileCompleted: boolean;
  photosUploaded: boolean;
  modelGenerated: boolean;
  onboardingCompleted: boolean;
  status: string;
}

const checkProfileCompleted = (user: User): boolean => {
  // Profile is completed if user has name AND date of birth
  const hasName = Boolean(user.name && user.name.trim() !== "");
  const hasDob = Boolean(user.dob && user.dob.trim() !== "");

  return hasName && hasDob;
};

const checkPhotosUploaded = (user: User): boolean => {
  // Photos uploaded if user has both face and body images
  const hasFaceImages = Boolean(
    user.faceImages &&
      Array.isArray(user.faceImages) &&
      user.faceImages.length > 0
  );

  const hasBodyImages = Boolean(
    user.bodyImages &&
      // Check if bodyImages is an array (old format)
      ((Array.isArray(user.bodyImages) && user.bodyImages.length >= 2) ||
        // Check if bodyImages is an object with originalUrls (new format)
        (typeof user.bodyImages === "object" &&
          user.bodyImages.originalUrls &&
          Array.isArray(user.bodyImages.originalUrls) &&
          user.bodyImages.originalUrls.length >= 2))
  );

  return hasFaceImages && hasBodyImages;
};

const checkModelGenerated = (user: User): boolean => {
  // Model generated if user has a base model URL
  const hasBaseModel = Boolean(
    user.baseModelUrl && user.baseModelUrl.trim() !== ""
  );

  return hasBaseModel;
};

const generateStatusMessage = (
  profileCompleted: boolean,
  photosUploaded: boolean,
  modelGenerated: boolean,
  onboardingCompleted: boolean
): string => {
  if (onboardingCompleted) {
    return "Onboarding completed successfully! Welcome to the platform.";
  }

  const missingSteps: string[] = [];

  if (!profileCompleted) {
    missingSteps.push("complete profile (add name and date of birth)");
  }

  if (!photosUploaded) {
    missingSteps.push("upload photos (face and body images)");
  }

  if (!modelGenerated) {
    missingSteps.push("generate your AI model");
  }

  const stepsCount = missingSteps.length;
  if (stepsCount > 0) {
    return `You need  to complete onboarding.`;
  }
};

// Optional: If you want to add getUserOnboardingStatusById function
export const getUserOnboardingStatusById = async (
  userId: number
): Promise<OnboardingStatus> => {
  try {
    console.log(`Checking onboarding status for user ID: ${userId}`);

    const user = await User.findByPk(userId);

    if (!user) {
      throw new Error("User not found");
    }

    console.log(`User found: ${user.name} (ID: ${user.id})`);

    // Check onboarding milestones
    const profileCompleted = checkProfileCompleted(user);
    const photosUploaded = checkPhotosUploaded(user);
    const modelGenerated = checkModelGenerated(user);

    // All milestones completed = onboarding complete
    const onboardingCompleted =
      profileCompleted && photosUploaded && modelGenerated;

    // Generate status message
    const status = generateStatusMessage(
      profileCompleted,
      photosUploaded,
      modelGenerated,
      onboardingCompleted
    );

    console.log(
      `Onboarding Status - Profile: ${profileCompleted}, Photos: ${photosUploaded}, Model: ${modelGenerated}, Complete: ${onboardingCompleted}`
    );

    return {
      profileCompleted,
      photosUploaded,
      modelGenerated,
      onboardingCompleted,
      status,
    };
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    throw error;
  }
};
