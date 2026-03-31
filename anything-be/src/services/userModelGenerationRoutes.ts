import express from "express";
import {
  isValidEmail,
  validatePasswordStrength,
  validateDateOfBirth,
  validateName,
  hashPassword,
  validateHeight,
  validateWeight,
  validateGender,
  generateAuthToken,
  verifyToken,
} from "../helpers/utils";
import { User } from "../models/index";
import { modelGenerationUpload, validateFieldFiles } from "./fileUploadService";
import { gcsService } from "./gcsService";
import { addModelGenerationJob, modelGenerationQueue } from "../queues/modelGenerationQueue";
import { pollJobUntilComplete } from "../helpers/jobPoller";

const router = express.Router();

// Create user with model generation using file uploads
router.post(
  "/create-user-with-model-generation",
  modelGenerationUpload,
  async (req, res) => {
    try {
      // Extract form data
      const { email, password, name, userName, dob, height, weight, gender } =
        req.body;

      // Extract session token from Authorization header
      const authHeader = req.headers.authorization;
      let sessionToken: string | undefined;

      if (authHeader && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.substring(7); // Remove 'Bearer ' prefix
      }

      // console.log("📝 Creating user with model generation:", {
      //   email,
      //   name: name || "Not provided",
      //   userName: userName || "Not provided",
      //   hasSessionToken: !!sessionToken,
      //   hasHeight: !!height,
      //   hasWeight: !!weight,
      // });

      // Validate session token
      if (!sessionToken || typeof sessionToken !== "string") {
        return res.status(401).json({
          success: false,
          status: "Invalid session token",
          userId: null,
          userName: null,
          authToken: null,
          modelPhoto: null,
          modelGenerationStatus: "Failed - Invalid session",
        });
      }

      // Verify the session token
      let sessionPayload;
      try {
        sessionPayload = await verifyToken(sessionToken);
        // Ensure it's a session token (not an auth token)
        if (sessionPayload.type !== "session") {
          return res.status(401).json({
            success: false,
            status: "Invalid session token type",
            userId: null,
            userName: null,
            authToken: null,
            modelPhoto: null,
            modelGenerationStatus: "Failed - Invalid session token type",
          });
        }
      } catch (tokenError) {
        return res.status(401).json({
          success: false,
          status: "Invalid or expired session token",
          userId: null,
          userName: null,
          authToken: null,
          modelPhoto: null,
          modelGenerationStatus: "Failed - Invalid or expired session",
        });
      }

      console.log("✅ Session token validated successfully");

      // Validate required fields
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          status: "Email and password are required",
          userId: null,
          userName: null,
          authToken: null,
          modelPhoto: null,
          modelGenerationStatus: "Failed - Missing required fields",
        });
      }

      // Transform email to lowercase
      const emailLowercase = email.toLowerCase();

      // Validate email format
      if (!isValidEmail(emailLowercase)) {
        return res.status(400).json({
          success: false,
          status: "Invalid email format",
          userId: null,
          userName: null,
          authToken: null,
          modelPhoto: null,
          modelGenerationStatus: "Failed - Invalid email",
        });
      }

      // Validate password strength
      const passwordValidation = validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          status: passwordValidation.message,
          userId: null,
          userName: null,
          authToken: null,
          modelPhoto: null,
          modelGenerationStatus: "Failed - Invalid password",
        });
      }

      // Validate date of birth if provided
      if (dob) {
        console.log(
          "🔍 DOB Debug - Received dob:",
          dob,
          "Type:",
          typeof dob,
          "Length:",
          dob.length
        );
        const dobValidation = validateDateOfBirth(dob);
        console.log("🔍 DOB Validation result:", dobValidation);
        if (!dobValidation.isValid) {
          return res.status(400).json({
            success: false,
            status: dobValidation.message,
            userId: null,
            userName: null,
            authToken: null,
            modelPhoto: null,
            modelGenerationStatus: "Failed - Invalid date of birth",
          });
        }
      }

      // Validate name if provided
      if (name) {
        const nameValidation = validateName(name);
        if (!nameValidation.isValid) {
          return res.status(400).json({
            success: false,
            status: nameValidation.message,
            userId: null,
            userName: null,
            authToken: null,
            modelPhoto: null,
            modelGenerationStatus: "Failed - Invalid name",
          });
        }
      }

      // Validate height if provided
      if (height !== undefined && height !== "") {
        const heightValue = parseInt(height);
        const heightValidation = validateHeight(heightValue);
        if (!heightValidation.isValid) {
          return res.status(400).json({
            success: false,
            status: heightValidation.message,
            userId: null,
            userName: null,
            authToken: null,
            modelPhoto: null,
            modelGenerationStatus: "Failed - Invalid height",
          });
        }
      }

      // Validate weight if provided
      if (weight !== undefined && weight !== "") {
        const weightValue = parseInt(weight);
        const weightValidation = validateWeight(weightValue);
        if (!weightValidation.isValid) {
          return res.status(400).json({
            success: false,
            status: weightValidation.message,
            userId: null,
            userName: null,
            authToken: null,
            modelPhoto: null,
            modelGenerationStatus: "Failed - Invalid weight",
          });
        }
      }

      // Validate gender if provided
      if (gender !== undefined && gender !== "") {
        const genderValidation = validateGender(gender);
        if (!genderValidation.isValid) {
          return res.status(400).json({
            success: false,
            status: genderValidation.message,
            userId: null,
            userName: null,
            authToken: null,
            modelPhoto: null,
            modelGenerationStatus: "Failed - Invalid gender",
          });
        }
      }

      // Check if email is already used
      const existingUser = await User.findOne({
        where: { email: emailLowercase },
      });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          status: "Email is already registered",
          userId: null,
          userName: null,
          authToken: null,
          modelPhoto: null,
          modelGenerationStatus: "Failed - Email already exists",
        });
      }

      // Validate uploaded files
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      const validation = validateFieldFiles(files, {
        bodyPhotos: { min: 2, max: 6, required: true },
        facePhotos: { min: 0, max: 4, required: false },
      });

      if (!validation.isValid) {
        return res.status(400).json({
          success: false,
          status: validation.message,
          userId: null,
          userName: null,
          authToken: null,
          modelPhoto: null,
          modelGenerationStatus: "Failed - Invalid photo uploads",
        });
      }

      console.log(
        `📸 Validated uploads: ${files.bodyPhotos.length} body photos, ${
          files.facePhotos?.length || 0
        } face photos`
      );

      // Hash password
      const hashedPassword = await hashPassword(password);

      // Create new user record
      // Use userName if provided, otherwise fallback to name, then auto-generate
      const finalUserName = userName
        ? userName.trim()
        : name
        ? name.trim()
        : `User${Math.floor(Math.random() * 10000)}`;

      const newUser = await User.create({
        email: emailLowercase,
        password: hashedPassword,
        name: finalUserName,
        dob: dob || null,
        height: height ? parseInt(height) : 0,
        weight: weight ? parseInt(weight) : 0,
        gender: gender ? gender.toLowerCase().trim() : null,
        profileCompleted: false,
      });

      // Generate authentication token
      const authToken = await generateAuthToken(newUser.email, newUser.id);

      console.log(`✅ New user created: ${newUser.email} (ID: ${newUser.id})`);

      // Now proceed with model generation using queue system
      try {
        console.log(
          `🎯 Uploading files and queueing model generation for user ID: ${
            newUser.id
          } with ${files.bodyPhotos.length} body photos${
            files.facePhotos
              ? ` and ${files.facePhotos.length} face photos`
              : ""
          }`
        );

        // STEP 1: Upload files to GCS immediately (before queueing)
        await gcsService.ensureUserFolderExists(newUser.id.toString());
        
        const uploadedFiles = {
          bodyPhotos: [] as any[],
          facePhotos: [] as any[],
        };

        // Upload body photos to temp folder in GCS
        for (let i = 0; i < files.bodyPhotos.length; i++) {
          const file = files.bodyPhotos[i];
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const fileName = `temp-body-${i}-${timestamp}.jpg`;

          const uploadResult = await gcsService.uploadFile(
            file.buffer,
            fileName,
            newUser.id.toString(),
            "Avatar/Temp",
            file.mimetype
          );

          uploadedFiles.bodyPhotos.push({
            httpUrl: uploadResult.httpUrl,
            originalName: file.originalname,
            mimetype: file.mimetype,
          });
        }

        // Upload face photos (if any)
        if (files.facePhotos && files.facePhotos.length > 0) {
          for (let i = 0; i < files.facePhotos.length; i++) {
            const file = files.facePhotos[i];
            const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
            const fileName = `temp-face-${i}-${timestamp}.jpg`;

            const uploadResult = await gcsService.uploadFile(
              file.buffer,
              fileName,
              newUser.id.toString(),
              "Avatar/Temp",
              file.mimetype
            );

            uploadedFiles.facePhotos.push({
              httpUrl: uploadResult.httpUrl,
              originalName: file.originalname,
              mimetype: file.mimetype,
            });
          }
        }

        console.log(`✅ Files uploaded to GCS, adding job to queue...`);

        // STEP 2: Add job to queue (returns immediately)
        const jobId = await addModelGenerationJob({
          userId: newUser.id.toString(),
          bodyPhotoUrls: uploadedFiles.bodyPhotos,
          facePhotoUrls: uploadedFiles.facePhotos,
          height: height ? parseInt(height) : undefined,
          weight: weight ? parseInt(weight) : undefined,
          dob: dob || undefined,
          gender: gender ? gender.toLowerCase().trim() : undefined,
        });

        console.log(`✅ Model generation job queued with ID: ${jobId}`);
        console.log(`⏳ Polling job status every 2 seconds until complete...`);

        // Poll the job until it completes (server-side polling)
        const result = await pollJobUntilComplete(
          modelGenerationQueue,
          jobId,
          {
            pollInterval: 2000, // Poll every 2 seconds
            timeout: 180000, // 3 minutes timeout
          }
        );

        if (result.status === "completed") {
          console.log(`✅ Model generation completed successfully`);
          
          // Mark user profile as completed
          await newUser.update({ profileCompleted: true });
          
          // Return successful result
          return res.json({
            success: true,
            status: "User created and model generated successfully",
            userId: newUser.id,
            userName: newUser.name,
            authToken,
            modelPhoto: result.data?.modelPhoto || null,
            modelGenerationStatus: result.data?.status || "completed",
            jobId: jobId,
          });
        } else if (result.status === "failed") {
          console.error(`❌ Model generation failed: ${result.error}`);
          return res.json({
            success: true, // User creation was successful
            status: "User created successfully, but model generation failed",
            userId: newUser.id,
            userName: newUser.name,
            authToken,
            modelPhoto: null,
            modelGenerationStatus: `failed: ${result.error}`,
            jobId: jobId,
          });
        } else if (result.status === "timeout") {
          console.warn(`⏱️ Model generation timeout`);
          return res.json({
            success: true, // User creation was successful
            status: "User created successfully, model generation is taking longer than expected",
            userId: newUser.id,
            userName: newUser.name,
            authToken,
            modelPhoto: null,
            modelGenerationStatus: "timeout - check job status later",
            jobId: jobId,
          });
        }
      } catch (uploadError) {
        console.error("Error uploading files or queueing job:", uploadError);

        // User was created successfully, but file upload/queueing failed
        return res.json({
          success: true, // User creation was successful
          status: "User created successfully, but model generation failed to start",
          userId: newUser.id,
          userName: newUser.name,
          authToken,
          jobId: null,
          modelPhoto: null,
          modelGenerationStatus: `Model generation failed to start: ${
            uploadError instanceof Error ? uploadError.message : "Unknown error"
          }`,
        });
      }
    } catch (error) {
      console.error("Error in createUserWithModelGeneration:", error);
      return res.status(500).json({
        success: false,
        status: "Internal server error",
        userId: null,
        userName: null,
        authToken: null,
        modelPhoto: null,
        modelGenerationStatus: "Failed - Internal server error",
      });
    }
  }
);

export default router;
