import { authenticateUser } from "../services/helper/auth";
import {
  getUserHomePageDetailsById,
  getMainLandingImagesById,
} from "../services/home/home";

const homeResolvers = {
  Query: {
    getUserHomePageDetails: async (
      _: any,
      __: any,
      // { userId }: { userId: number },
      context: any,
    ) => {
      try {
        const auth = await authenticateUser(context);

        if (auth.error) return { status: "unable to authenticate user" };
        const userId = auth.user.userId;

        const userHomePageDetails = await getUserHomePageDetailsById(userId);

        return {
          ...userHomePageDetails,
        };
      } catch (error) {
        console.error("Error in getUserOnboardingStatus:", error);
        return {
          status: `Error retrieving onboarding status: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          profileCompleted: false,
          photosUploaded: false,
          modelGenerated: false,
          onboardingCompleted: false,
        };
      }
    },
    getMainLandingImages: async (_: any, __: any, context: any) => {
      try {
        const auth = await authenticateUser(context);

        if (auth.error)
          return {
            status: "unable to authenticate user",
            mainLandingImages: [],
          };
        const userId = auth.user.userId;

        const mainLandingImagesResponse =
          await getMainLandingImagesById(userId);

        return {
          ...mainLandingImagesResponse,
        };
      } catch (error) {
        console.error("Error in getMainLandingImages:", error);
        return {
          status: `Error retrieving main landing images: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          mainLandingImages: [],
        };
      }
    },
  },

  Mutation: {},
};

export default homeResolvers;
