import { z } from "zod"

export const metadataInputSchema = z
  .object({
    duration: z.string().max(20).optional(),
    durationMs: z
      .number()
      .int()
      .nonnegative()
      .max(24 * 60 * 60 * 1000)
      .nullable()
      .optional()
      .transform((value) => value ?? undefined),
    thumbnailUrl: z.string().url().optional(),
    pageTitle: z.string().max(300).optional(),
    sdkVersion: z.string().max(40).optional(),
    submittedVia: z.string().max(40).optional(),
  })
  .strict()
  .optional()

export const deviceInfoInputSchema = z
  .object({
    browser: z.string().optional(),
    os: z.string().optional(),
    viewport: z.string().optional(),
  })
  .strict()
  .optional()

// The version of the environment shape. Adding an optional field (the tester
// label, the release channel) keeps the version; changing or removing a field
// bumps it, and readers branch on it.
export const ENVIRONMENT_SCHEMA_VERSION = 1

// What the tester was running. Optional on the wire so SDK reports and older
// extension builds still validate; strict so a stray field is rejected.
export const environmentInputSchema = z
  .object({
    schemaVersion: z.literal(ENVIRONMENT_SCHEMA_VERSION),
    extensionVersion: z.string().max(40),
    buildSha: z.string().max(80),
    browser: z
      .object({
        name: z.string().max(60),
        version: z.string().max(40).optional(),
      })
      .strict(),
    os: z.string().max(100).optional(),
    viewport: z
      .object({
        width: z.number().int().nonnegative().max(100_000),
        height: z.number().int().nonnegative().max(100_000),
      })
      .strict(),
    devicePixelRatio: z.number().positive().max(100),
    capture: z
      .object({
        type: z.enum(["screenshot", "video"]),
        durationMs: z
          .number()
          .int()
          .nonnegative()
          .max(24 * 60 * 60 * 1000),
      })
      .strict(),
    // Present only when the tester allows sharing the page (already redacted).
    page: z
      .object({
        url: z.string().max(2048).optional(),
        title: z.string().max(300).optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .optional()
