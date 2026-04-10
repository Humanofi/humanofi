// ========================================
// HIUID — Humanofi Unique Identity Generator
// ========================================
//
// Generates a deterministic SHA-256 hash from verified identity data.
// 1 human = 1 HIUID = 1 token. Non-reversible, non-forgeable.

import { createHash } from "crypto";

export interface HIUIDInput {
  firstName: string;
  lastName: string;
  dateOfBirth: string; // ISO format: YYYY-MM-DD
  countryCode: string; // ISO 3166-1 alpha-2 (e.g., "FR", "US")
  documentNumber: string;
}

/**
 * Normalize a string for HIUID computation:
 * - Convert to lowercase
 * - Remove accents/diacritics
 * - Remove all spaces and hyphens
 */
export function normalizeString(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/[\s\-]/g, ""); // Remove spaces and hyphens
}

/**
 * Validate date format (YYYY-MM-DD).
 */
export function validateDateOfBirth(date: string): boolean {
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(date)) return false;

  const parsed = new Date(date);
  return !isNaN(parsed.getTime());
}

/**
 * Validate country code (ISO 3166-1 alpha-2).
 */
export function validateCountryCode(code: string): boolean {
  return /^[A-Z]{2}$/.test(code.toUpperCase());
}

/**
 * Hash a document number (intermediate SHA-256).
 * The raw document number is never stored — only this hash.
 */
export function hashDocumentNumber(documentNumber: string): string {
  return createHash("sha256").update(documentNumber.trim()).digest("hex");
}

/**
 * Generate a HIUID (Humanofi Unique Identity) from verified identity data.
 *
 * Algorithm:
 *   1. Normalize first name, last name
 *   2. Validate date of birth and country code
 *   3. Hash document number (intermediate SHA-256)
 *   4. Concatenate: "firstname|lastname|YYYY-MM-DD|XX|doc_hash"
 *   5. Final SHA-256 with SECRET_PEPPER
 *
 * @param input - The verified identity data from Stripe Identity
 * @param pepper - The SECRET_PEPPER (64-char hex string from env)
 * @returns The HIUID (64-char hex string)
 * @throws Error if inputs are invalid or pepper is missing
 */
export function generateHIUID(input: HIUIDInput, pepper?: string): string {
  // Get pepper from argument or environment
  const secretPepper = pepper || process.env.HIUID_SECRET_PEPPER;

  if (!secretPepper || secretPepper.length < 32) {
    throw new Error(
      "HIUID_SECRET_PEPPER is required and must be at least 32 characters. " +
        "Generate one with: openssl rand -hex 32"
    );
  }

  // Validate inputs
  if (!input.firstName || !input.lastName) {
    throw new Error("First name and last name are required");
  }

  if (!validateDateOfBirth(input.dateOfBirth)) {
    throw new Error(
      `Invalid date of birth format: "${input.dateOfBirth}". Expected YYYY-MM-DD.`
    );
  }

  if (!validateCountryCode(input.countryCode)) {
    throw new Error(
      `Invalid country code: "${input.countryCode}". Expected ISO 3166-1 alpha-2 (e.g., "FR", "US").`
    );
  }

  if (!input.documentNumber) {
    throw new Error("Document number is required");
  }

  // Normalize inputs
  const firstName = normalizeString(input.firstName);
  const lastName = normalizeString(input.lastName);
  const dateOfBirth = input.dateOfBirth.trim();
  const countryCode = input.countryCode.toUpperCase().trim();
  const docHash = hashDocumentNumber(input.documentNumber);

  // Build input string
  const inputString = `${firstName}|${lastName}|${dateOfBirth}|${countryCode}|${docHash}`;

  // Final SHA-256 with pepper
  const hiuid = createHash("sha256")
    .update(inputString + secretPepper)
    .digest("hex");

  return hiuid;
}

/**
 * Verify that a given HIUID matches the expected identity data.
 * Used to confirm that a returning user produces the same HIUID.
 */
export function verifyHIUID(
  input: HIUIDInput,
  expectedHIUID: string,
  pepper?: string
): boolean {
  const computed = generateHIUID(input, pepper);
  return computed === expectedHIUID;
}
