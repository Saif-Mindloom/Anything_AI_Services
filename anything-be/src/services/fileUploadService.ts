import multer from "multer";

// File upload configuration interface
interface UploadConfig {
  maxFileSize?: number; // in MB
  maxFiles?: number;
  allowedMimeTypes?: string[];
  fieldConfigs?: Array<{
    name: string;
    maxCount: number;
  }>;
}

// Default configuration
const DEFAULT_CONFIG: UploadConfig = {
  maxFileSize: 10, // 10MB
  maxFiles: 2,
  allowedMimeTypes: [
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/webp",
    "image/heic",
    "image/heif",
  ],
  fieldConfigs: [{ name: "files", maxCount: 10 }],
};

// Create multer instance with custom configuration
export const createUploadMiddleware = (config: UploadConfig = {}) => {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  const storage = multer.memoryStorage();

  const upload = multer({
    storage: storage,
    limits: {
      fileSize: finalConfig.maxFileSize! * 1024 * 1024, // Convert MB to bytes
      files: finalConfig.maxFiles,
    },
    fileFilter: (req, file, cb) => {
      if (
        finalConfig.allowedMimeTypes!.some((type) =>
          file.mimetype.startsWith(type.split("/")[0]),
        )
      ) {
        cb(null, true);
      } else {
        cb(
          new Error(
            `Only these file types are allowed: ${finalConfig.allowedMimeTypes!.join(
              ", ",
            )}`,
          ) as any,
          false,
        );
      }
    },
  });

  return upload;
};

// Create field-specific upload middleware
export const createFieldUploadMiddleware = (
  fieldConfigs: Array<{ name: string; maxCount: number }>,
  config: UploadConfig = {},
) => {
  const upload = createUploadMiddleware(config);
  return upload.fields(fieldConfigs);
};

// Create single file upload middleware
export const createSingleFileMiddleware = (
  fieldName: string = "file",
  config: UploadConfig = {},
) => {
  const upload = createUploadMiddleware(config);
  return upload.single(fieldName);
};

export const validateFieldFiles = (
  files: { [fieldname: string]: Express.Multer.File[] },
  requirements: {
    [fieldname: string]: { min?: number; max?: number; required?: boolean };
  },
): { isValid: boolean; message?: string } => {
  for (const [fieldName, requirements_field] of Object.entries(requirements)) {
    const fieldFiles = files[fieldName] || [];
    const { min = 0, max, required = false } = requirements_field;

    if (required && fieldFiles.length === 0) {
      return {
        isValid: false,
        message: `${fieldName} is required`,
      };
    }

    if (fieldFiles.length < min) {
      return {
        isValid: false,
        message: `${fieldName} requires at least ${min} file(s)`,
      };
    }

    if (max && fieldFiles.length > max) {
      return {
        isValid: false,
        message: `${fieldName} allows maximum ${max} file(s)`,
      };
    }
  }

  return { isValid: true };
};

// Pre-configured upload middlewares for common use cases

// Model generation uploads
export const modelGenerationUpload = createFieldUploadMiddleware(
  [
    { name: "bodyPhotos", maxCount: 6 },
    { name: "facePhotos", maxCount: 4 },
  ],
  {
    maxFileSize: 10, // 10MB per file
    maxFiles: 10,
    allowedMimeTypes: ["image/"],
  },
);

// Single image upload for background removal, clothing detection, etc.
export const singleImageUpload = createSingleFileMiddleware("image", {
  maxFileSize: 10,
  maxFiles: 1,
  allowedMimeTypes: ["image/"],
});

// Multiple image upload for clothing detection (1-10 images)
export const multipleImageUpload = createUploadMiddleware({
  maxFileSize: 10,
  maxFiles: 10,
  allowedMimeTypes: ["image/"],
}).array("images", 10); // Accept 1-10 images with field name "images"

// Default export object with all functions for convenience
export default {
  createUploadMiddleware,
  createFieldUploadMiddleware,
  createSingleFileMiddleware,
  validateFieldFiles,
};
