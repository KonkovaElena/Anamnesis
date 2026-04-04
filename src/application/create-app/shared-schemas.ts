import { z } from "zod";

export const artifactTypeSchema = z.enum(["note", "lab", "summary", "report", "imaging-summary"]);

export const documentContentTypeSchema = z.enum(["text/plain", "text/markdown"]);

export const sourceDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) => {
      const date = new Date(`${value}T00:00:00Z`);
      return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
    },
    { message: "sourceDate must be a valid calendar date in YYYY-MM-DD format" },
  )
  .refine(
    (value) => new Date(`${value}T00:00:00Z`) <= new Date(),
    { message: "sourceDate must not be in the future" },
  );