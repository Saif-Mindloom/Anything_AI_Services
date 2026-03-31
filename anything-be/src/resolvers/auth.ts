import {
  generateAuthToken,
  generateOTP,
  generateSessionToken,
  getOTPExpiry,
  hashOTP,
  isValidEmail,
  verifyOTP,
  verifyPassword,
} from "../helpers/utils";
import { EmailOtp, User } from "../models/index";
import { sendOTPEmail } from "../services/emailService";
import { checkEmailFormatService } from "../services/helper/checkEmailFormat";

const authResolvers = {
  Mutation: {
    sendOtp: async (_: any, { email }: { email: string }) => {
      try {
        // Transform email to lowercase
        const emailLowercase = email.toLowerCase();

        // Use comprehensive email validation service for format checking
        const emailValidation = await checkEmailFormatService(emailLowercase);

        if (!emailValidation.isValidFormat) {
          return {
            success: false,
            message: emailValidation.status,
            isExistingUser: false,
            otpExpiresIn: 0,
          };
        }

        // Keep original logic for checking existing user
        const existingUser = await User.findOne({
          where: { email: emailLowercase },
        });
        const isExistingUser = !!existingUser;

        const otp = generateOTP();
        console.log(`🔐 Generated OTP for ${emailLowercase}: ${otp}`);
        const hashedOtp = await hashOTP(otp);
        const expiresAt = getOTPExpiry();

        await EmailOtp.destroy({ where: { email: emailLowercase } });

        await EmailOtp.create({
          userId: existingUser?.id || null,
          email: emailLowercase,
          otp: hashedOtp,
          expiresAt,
        });

        // Only send OTP email for new users, not existing users
        if (!isExistingUser) {
          const emailSent = await sendOTPEmail(emailLowercase, otp);

          if (!emailSent) {
            return {
              success: false,
              message: "Failed to send OTP email",
              isExistingUser,
              otpExpiresIn: 0,
            };
          }
        }

        const otpExpiresIn = 300;

        return {
          success: true,
          message: isExistingUser
            ? "OTP generated for existing user (email not sent)"
            : "OTP sent successfully",
          isExistingUser,
          otpExpiresIn,
        };
      } catch (error) {
        console.error("Error in sendOtp:", error);
        return {
          success: false,
          message: "Internal server error",
          isExistingUser: false,
          otpExpiresIn: 0,
        };
      }
    },

    verifyOtp: async (
      _: any,
      { email, otp }: { email: string; otp: string }
    ) => {
      try {
        // Transform email to lowercase
        const emailLowercase = email.toLowerCase();

        // Validate email format
        if (!isValidEmail(emailLowercase)) {
          return {
            isVerified: false,
            status: "Invalid email format",
            sessionToken: null,
          };
        }

        // Validate OTP format (should be 6 digits)
        if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
          return {
            isVerified: false,
            status: "Invalid OTP format",
            sessionToken: null,
          };
        }

        // Fetch OTP entry for the email
        const otpEntry = await EmailOtp.findOne({
          where: { email: emailLowercase },
          order: [["createdAt", "DESC"]], // Get the most recent OTP
        });

        if (!otpEntry) {
          return {
            isVerified: false,
            status: "No OTP found for this email",
            sessionToken: null,
          };
        }

        // Check if OTP has expired
        const now = new Date();
        if (now > otpEntry.expiresAt) {
          // Delete expired OTP
          await otpEntry.destroy();
          return {
            isVerified: false,
            status: "OTP has expired",
            sessionToken: null,
          };
        }

        // Verify OTP against hash
        const isOtpValid = await verifyOTP(otp, otpEntry.otp);

        if (!isOtpValid) {
          return {
            isVerified: false,
            status: "Incorrect OTP",
            sessionToken: null,
          };
        }

        // OTP is valid - check if user exists in DB
        const existingUser = await User.findOne({
          where: { email: emailLowercase },
        });

        // Generate temporary session token (valid for 15 minutes)
        const sessionToken = await generateSessionToken(
          emailLowercase,
          existingUser?.id
        );

        // Delete/invalidate OTP entry after successful verification
        await otpEntry.destroy();

        return {
          isVerified: true,
          status: "OTP verified successfully",
          sessionToken,
        };
      } catch (error) {
        console.error("Error in verifyOtp:", error);
        return {
          isVerified: false,
          status: "Internal server error",
          sessionToken: null,
        };
      }
    },

    login: async (
      _: any,
      { email, password }: { email: string; password: string }
    ) => {
      try {
        // Transform email to lowercase
        const emailLowercase = email.toLowerCase();

        // Validate email format
        if (!isValidEmail(emailLowercase)) {
          return {
            status: "Invalid email format",
            authToken: null,
            userId: null,
            userProfileCompleted: false,
          };
        }

        // Validate password (basic length check)
        if (!password || password.length < 6) {
          return {
            status: "Password must be at least 6 characters long",
            authToken: null,
            userId: null,
            userProfileCompleted: false,
          };
        }

        // Find user by email
        const user = await User.findOne({ where: { email: emailLowercase } });

        if (!user) {
          return {
            status: "User not found",
            authToken: null,
            userId: null,
            userProfileCompleted: false,
          };
        }

        // Check if user has a password set
        if (!user.password) {
          return {
            status:
              "Password not set. Please use OTP login or set a password first",
            authToken: null,
            userId: null,
            userProfileCompleted: false,
          };
        }

        // Verify password against hash
        const isPasswordValid = await verifyPassword(password, user.password);

        if (!isPasswordValid) {
          return {
            status: "Invalid credentials",
            authToken: null,
            userId: null,
            userProfileCompleted: false,
          };
        }

        // Generate authentication token (24-hour validity)
        const authToken = await generateAuthToken(user.email, user.id);

        // Check if user profile is completed
        const userProfileCompleted = user.profileCompleted || false;

        return {
          status: "Login successful",
          authToken,
          userId: user.id,
          userProfileCompleted,
        };
      } catch (error) {
        console.error("Error in login:", error);
        return {
          status: "Internal server error",
          authToken: null,
          userId: null,
          userProfileCompleted: false,
        };
      }
    },
  },
};

export default authResolvers;
