import { z } from "zod";
import {
  artifactTypeSchema,
  documentContentTypeSchema,
  sourceDateSchema,
} from "./shared-schemas";

export const documentIngestionSchema = z.strictObject({
  artifactType: artifactTypeSchema,
  title: z.string().trim().min(1).max(200),
  contentType: documentContentTypeSchema,
  content: z.string().min(1).max(12000),
  filename: z.string().trim().min(1).max(160).optional(),
  sourceDate: sourceDateSchema.optional(),
  provenance: z.string().trim().min(1).max(300).optional(),
});

export const fhirImportSchema = z.strictObject({
  artifactType: artifactTypeSchema.default("report"),
  title: z.string().trim().min(1).max(200).optional(),
  sourceDate: sourceDateSchema.optional(),
  provenance: z.string().trim().min(1).max(300).optional(),
  resource: z.record(z.string(), z.unknown()),
});

export const fhirBundleImportSchema = z.strictObject({
  artifactType: artifactTypeSchema.default("report"),
  sourceDate: sourceDateSchema.optional(),
  provenance: z.string().trim().min(1).max(300).optional(),
  allowExternalAttachmentFetch: z.boolean().default(false),
  resource: z.record(z.string(), z.unknown()),
});