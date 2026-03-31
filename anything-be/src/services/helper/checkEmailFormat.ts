import { Op } from "sequelize";
import { User } from "../../models";

export const checkEmailFormatService = async (email: string) => {
  try {
    const trimmedEmail = email.trim().toLowerCase();

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(trimmedEmail)) {
      return {
        isValidFormat: false,
        isAvailable: false,
        status: "Invalid email format",
      };
    }

    // Check email availability in DB
    const existingUser = await User.findOne({
      where: {
        email: {
          [Op.iLike]: trimmedEmail,
        },
      },
    });

    if (!existingUser) {
      return {
        isValidFormat: true,
        isAvailable: true,
        status: "Email is valid and available",
      };
    }

    return {
      isValidFormat: true,
      isAvailable: false,
      status: "Email already exists",
    };
  } catch (error) {
    console.error("Error in checkEmailFormatService:", error);
    return {
      isValidFormat: false,
      isAvailable: false,
      status: "Internal server error",
    };
  }
};
