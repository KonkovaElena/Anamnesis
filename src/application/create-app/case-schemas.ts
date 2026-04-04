import { z } from "zod";
import { artifactTypeSchema, sourceDateSchema } from "./shared-schemas";

export const createCaseSchema = z.strictObject({
  patientLabel: z.string().trim().min(1).max(120).optional(),
  intake: z.strictObject({
    chiefConcern: z.string().trim().min(1).max(200),
    symptomSummary: z.string().trim().min(1).max(4000),
    historySummary: z.string().trim().min(1).max(4000),
    questionsForClinician: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  }),
});

export const addArtifactSchema = z.strictObject({
  artifactType: artifactTypeSchema,
  title: z.string().trim().min(1).max(200),
  summary: z.string().trim().min(1).max(4000),
  sourceDate: sourceDateSchema.optional(),
  provenance: z.string().trim().min(1).max(300).optional(),
});