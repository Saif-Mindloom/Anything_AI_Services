import {
  getUserFromToken,
  isValidEmail,
  validateDateOfBirth,
  validateHeight,
  validateName,
  validatePasswordStrength,
  validateWeight,
} from "../helpers/utils";
import { User } from "../models/index";
import { authenticateUser } from "../services/helper/auth";
import { getUserOnboardingStatusById } from "../services/onboardingService";
import { getUserProfileDetailsById } from "../services/profile/profile";
import {
  scheduleUserDeletion,
  cancelScheduledDeletion,
  deleteUserImmediately,
} from "../services/userDeletionService";

const userResolvers = {
  Query: {
    getUserOnboardingStatus: async (
      _: any,
      { userId }: { userId: number },
      context: any,
    ) => {
      try {
        const authHeader = context.req?.headers?.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return {
            status: "Authentication required. Please provide a valid token.",
            profileCompleted: false,
            photosUploaded: false,
            modelGenerated: false,
            onboardingCompleted: false,
          };
        }

        const token = authHeader.substring(7);
        const userFromToken = await getUserFromToken(token);

        if (!userFromToken) {
          return {
            status: "Invalid or expired token",
            profileCompleted: false,
            photosUploaded: false,
            modelGenerated: false,
            onboardingCompleted: false,
          };
        }

        const onboardingStatus = await getUserOnboardingStatusById(userId);

        return {
          status: onboardingStatus.status || "Error retrieving status",
          profileCompleted: Boolean(onboardingStatus.profileCompleted),
          photosUploaded: Boolean(onboardingStatus.photosUploaded),
          modelGenerated: Boolean(onboardingStatus.modelGenerated),
          onboardingCompleted: Boolean(onboardingStatus.onboardingCompleted),
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
    getUserProfileDetails: async (_: any, __: any, context: any) => {
      try {
        const auth = await authenticateUser(context);
        if (auth.error) {
          return {
            status: "unable to authenticate user",
            name: null,
            age: null,
            mainLandingImage: null,
            wardrobeDetails: null,
          };
        }

        const userId = auth.user.userId;

        const userProfileDetails = await getUserProfileDetailsById(userId);

        return {
          status: "success",
          name: userProfileDetails.name,
          age: userProfileDetails.age,
          dob: userProfileDetails.dob,
          weight: userProfileDetails.weight,
          height: userProfileDetails.height,
          email: userProfileDetails.email,
          gender: userProfileDetails.gender,
          mainLandingImage: userProfileDetails.mainLandingImage,
          wardrobeDetails: userProfileDetails.wardrobeDetails,
        };
      } catch (error) {
        console.error("Error in getUserProfileDetails:", error);

        return {
          status:
            error instanceof Error
              ? `Error retrieving profile details: ${error.message}`
              : "Unknown error",
          name: null,
          age: null,
          dob: null,
          weight: null,
          height: null,
          email: null,
          gender: null,
          mainLandingImage: null,
          wardrobeDetails: null,
        };
      }
    },
    getUserProfileDetailsForMCP: async (
      _: any,
      { userId }: { userId: number },
      context: any,
    ) => {
      try {
        const userProfileDetails = await getUserProfileDetailsById(userId);

        return {
          status: "success",
          name: userProfileDetails.name,
          age: userProfileDetails.age,
          dob: userProfileDetails.dob,
          weight: userProfileDetails.weight,
          height: userProfileDetails.height,
          email: userProfileDetails.email,
          mainLandingImage: userProfileDetails.mainLandingImage,
          wardrobeDetails: userProfileDetails.wardrobeDetails,
        };
      } catch (error) {
        console.error("Error in getUserProfileDetailsForMCP:", error);

        return {
          status:
            error instanceof Error
              ? `Error retrieving profile details: ${error.message}`
              : "Unknown error",
          name: null,
          age: null,
          dob: null,
          weight: null,
          height: null,
          email: null,
          mainLandingImage: null,
          wardrobeDetails: null,
        };
      }
    },
    checkIfNameAvailable: async (
      _: any,
      { name }: { name: string },
      context: any,
    ) => {
      try {
        console.log("checkIfNameAvailable", name);

        const nameValidation = validateName(name);
        if (!nameValidation.isValid) {
          return {
            isAvailable: false,
            status: nameValidation.message,
          };
        }

        const trimmedName = name.trim();

        console.log(`Checking name availability for: "${trimmedName}"`);

        const { Op } = await import("sequelize");
        const existingUser = await User.findOne({
          where: {
            name: { [Op.iLike]: trimmedName },
          },
          attributes: ["name"],
        });

        // If no match, name is available
        if (!existingUser) {
          return {
            isAvailable: true,
            status: "Name is available",
          };
        }

        // If it's exactly the same and belongs to the current user — optional logic
        // if (existingUser.name === trimmedName) {
        //   return {
        //     isAvailable: true,
        //     status: "This is your current name",
        //   };
        // }

        // Otherwise, taken
        return {
          isAvailable: false,
          status: "Name is already taken by another user",
        };
      } catch (error) {
        console.error("Error in checkIfNameAvailable:", error);
        return {
          isAvailable: false,
          status: "Internal server error while checking name availability",
        };
      }
    },
    checkPasswordValidity: async (
      _: any,
      { password }: { password: string },
    ) => {
      try {
        if (!password || typeof password !== "string") {
          return {
            isValid: false,
            status: "Password must be a non-empty string",
          };
        }

        const result = await validatePasswordStrength(password);
        return {
          isValid: result.isValid,
          status: result.message,
        };
      } catch (error) {
        console.error("Error in checkPasswordValidity resolver:", error);
        return {
          isValid: false,
          status: "Internal server error",
        };
      }
    },
  },

  Mutation: {
    editUserDetails: async (
      _: any,
      {
        email,
        name,
        dob,
        height,
        weight,
      }: {
        email?: string;
        name?: string;
        dob?: string;
        height?: number;
        weight?: number;
      },
      context: any,
    ) => {
      try {
        // Extract token from Authorization header
        const authHeader = context.req?.headers?.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
          return {
            name: "",
            dob: "",
            height: 0,
            weight: 0,
            status: "Authentication required. Please provide a valid token.",
          };
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        const userFromToken = await getUserFromToken(token);

        if (!userFromToken) {
          return {
            name: "",
            dob: "",
            height: 0,
            weight: 0,
            status: "Invalid or expired token",
          };
        }

        // Find the user in database
        const user = await User.findByPk(userFromToken.userId);
        if (!user) {
          return {
            name: "",
            dob: "",
            height: 0,
            weight: 0,
            status: "User not found",
          };
        }

        // Track if email is being changed
        let emailChanged = false;
        const updateData: any = {};

        // Validate and prepare updates
        if (email !== undefined) {
          // Transform email to lowercase
          const emailLowercase = email.toLowerCase();

          // Validate email format
          if (!isValidEmail(emailLowercase)) {
            return {
              name: user.name,
              dob: user.dob || "", // Return empty string if dob is null
              height: user.height,
              weight: user.weight,
              status: "Invalid email format",
            };
          }

          // Check if email is different from current
          if (emailLowercase !== user.email) {
            // Check if new email is already used by another user
            const existingUser = await User.findOne({
              where: { email: emailLowercase },
            });
            if (existingUser && existingUser.id !== user.id) {
              return {
                name: user.name,
                dob: user.dob || "", // Return empty string if dob is null
                height: user.height,
                weight: user.weight,
                status: "Email is already registered by another user",
              };
            }
            emailChanged = true;
            updateData.email = emailLowercase;
          }
        }

        if (name !== undefined) {
          const nameValidation = validateName(name);
          if (!nameValidation.isValid) {
            return {
              name: user.name,
              dob: user.dob || "", // Return empty string if dob is null
              height: user.height,
              weight: user.weight,
              status: nameValidation.message,
            };
          }
          updateData.name = name.trim();
        }

        if (dob !== undefined) {
          const dobValidation = validateDateOfBirth(dob);
          if (!dobValidation.isValid) {
            return {
              name: user.name,
              dob: user.dob || "", // Return empty string if dob is null
              height: user.height,
              weight: user.weight,
              status: dobValidation.message,
            };
          }
          updateData.dob = dob;
        }

        if (height !== undefined) {
          const heightValidation = validateHeight(height);
          if (!heightValidation.isValid) {
            return {
              name: user.name,
              dob: user.dob || "", // Return empty string if dob is null
              height: user.height,
              weight: user.weight,
              status: heightValidation.message,
            };
          }
          updateData.height = height;
        }

        if (weight !== undefined) {
          const weightValidation = validateWeight(weight);
          if (!weightValidation.isValid) {
            return {
              name: user.name,
              dob: user.dob || "", // Return empty string if dob is null
              height: user.height,
              weight: user.weight,
              status: weightValidation.message,
            };
          }
          updateData.weight = weight;
        }

        // If no fields to update
        if (Object.keys(updateData).length === 0) {
          return {
            name: user.name,
            dob: user.dob || "", // Return empty string if dob is null
            height: user.height,
            weight: user.weight,
            status: "No fields provided for update",
          };
        }

        // Update user in database
        await user.update(updateData);

        // Reload user to get updated data
        await user.reload();

        console.log(`User details updated: ${user.email} (ID: ${user.id})`);

        // Handle email change notification
        if (emailChanged) {
          return {
            name: user.name,
            dob: user.dob || "", // Return empty string if dob is null
            height: user.height,
            weight: user.weight,
            status:
              "Profile updated successfully. Email changed - please verify your new email address.",
          };
        }

        return {
          name: user.name,
          dob: user.dob || "", // Return empty string if dob is null
          height: user.height,
          weight: user.weight,
          status: "Profile updated successfully",
        };
      } catch (error) {
        console.error("Error in editUserDetails:", error);
        return {
          name: "",
          dob: "",
          height: 0,
          weight: 0,
          status: "Internal server error",
        };
      }
    },

    scheduleUserDeletion: async (_: any, __: any, context: any) => {
      try {
        const auth = await authenticateUser(context);
        if (auth.error) {
          return { success: false, scheduledFor: null, message: "Authentication required" };
        }

        const result = await scheduleUserDeletion(auth.user.userId);
        return {
          success: result.success,
          scheduledFor: result.scheduledFor ? result.scheduledFor.toISOString() : null,
          message: result.message,
        };
      } catch (error) {
        console.error("Error in scheduleUserDeletion:", error);
        return { success: false, scheduledFor: null, message: "Internal server error" };
      }
    },

    cancelScheduledUserDeletion: async (_: any, __: any, context: any) => {
      try {
        const auth = await authenticateUser(context);
        if (auth.error) {
          return { success: false, message: "Authentication required" };
        }

        const result = await cancelScheduledDeletion(auth.user.userId);
        return { success: result.success, message: result.message };
      } catch (error) {
        console.error("Error in cancelScheduledUserDeletion:", error);
        return { success: false, message: "Internal server error" };
      }
    },

    deleteUserImmediately: async (_: any, __: any, context: any) => {
      try {
        const auth = await authenticateUser(context);
        if (auth.error) {
          return { success: false, message: "Authentication required" };
        }

        const result = await deleteUserImmediately(auth.user.userId);
        return { success: result.success, message: result.message };
      } catch (error) {
        console.error("Error in deleteUserImmediately:", error);
        return { success: false, message: "Internal server error" };
      }
    },
  },
};

export default userResolvers;
