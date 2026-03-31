/**
 * Validation Helper Functions
 *
 * This file contains validation functions for input validation and data integrity checks.
 */

/**
 * Validation result interface
 */
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

/**
 * Validate required fields
 */
export const validateRequired = (
  data: Record<string, any>,
  requiredFields: string[]
): ValidationResult => {
  const errors: string[] = [];

  for (const field of requiredFields) {
    if (
      !data[field] ||
      (typeof data[field] === "string" && data[field].trim() === "")
    ) {
      errors.push(`${field} is required`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate string length
 */
export const validateStringLength = (
  value: string,
  min: number,
  max: number,
  fieldName: string
): ValidationResult => {
  const errors: string[] = [];

  if (value.length < min) {
    errors.push(`${fieldName} must be at least ${min} characters long`);
  }

  if (value.length > max) {
    errors.push(`${fieldName} must not exceed ${max} characters`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate number range
 */
export const validateNumberRange = (
  value: number,
  min: number,
  max: number,
  fieldName: string
): ValidationResult => {
  const errors: string[] = [];

  if (value < min) {
    errors.push(`${fieldName} must be at least ${min}`);
  }

  if (value > max) {
    errors.push(`${fieldName} must not exceed ${max}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validate file upload
 */
export const validateFileUpload = (
  file: any,
  allowedTypes: string[],
  maxSize: number
): ValidationResult => {
  const errors: string[] = [];

  if (!file) {
    errors.push("File is required");
    return { isValid: false, errors };
  }

  if (!allowedTypes.includes(file.mimetype)) {
    errors.push(
      `File type not allowed. Allowed types: ${allowedTypes.join(", ")}`
    );
  }

  if (file.size > maxSize) {
    errors.push(`File size exceeds limit of ${maxSize} bytes`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};
