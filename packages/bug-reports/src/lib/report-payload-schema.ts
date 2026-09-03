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
