import { z } from "zod";

export const DocumentNormalizationProfileSchema = z.enum([
  "document.text.plain.v1",
  "document.text.markdown.v1",
]);

export const FhirImportProfileSchema = z.enum([
  "fhir.binary.inline.text.v1",
  "fhir.document-reference.inline.text.v1",
  "fhir.document-reference.external.text.v1",
]);

export const FhirBundleProfileSchema = z.enum([
  "fhir.bundle.document.v1",
  "fhir.bundle.collection.v1",
]);

export const NormalizationProfileSchema = z.union([
  DocumentNormalizationProfileSchema,
  FhirImportProfileSchema,
  FhirBundleProfileSchema,
]);

export type DocumentNormalizationProfile = z.infer<typeof DocumentNormalizationProfileSchema>;
export type FhirImportProfile = z.infer<typeof FhirImportProfileSchema>;
export type FhirBundleProfile = z.infer<typeof FhirBundleProfileSchema>;
export type NormalizationProfile = z.infer<typeof NormalizationProfileSchema>;

export function classifyDocumentNormalizationProfile(
  contentType: "text/plain" | "text/markdown",
): DocumentNormalizationProfile {
  return contentType === "text/plain"
    ? "document.text.plain.v1"
    : "document.text.markdown.v1";
}

export function classifyFhirImportProfile(
  resourceType: "Binary" | "DocumentReference",
  sourceMode: "inline" | "external",
): FhirImportProfile {
  if (resourceType === "Binary") {
    return "fhir.binary.inline.text.v1";
  }

  return sourceMode === "external"
    ? "fhir.document-reference.external.text.v1"
    : "fhir.document-reference.inline.text.v1";
}

export function classifyFhirBundleProfile(
  bundleType: "document" | "collection",
): FhirBundleProfile {
  return bundleType === "document"
    ? "fhir.bundle.document.v1"
    : "fhir.bundle.collection.v1";
}

export function validateNormalizationProfile(input: unknown): NormalizationProfile {
  return NormalizationProfileSchema.parse(input);
}

export function validateFhirImportResultProfile(input: unknown): FhirImportProfile {
  return FhirImportProfileSchema.parse(input);
}

export function validateFhirBundleResultProfile(input: unknown): FhirBundleProfile {
  return FhirBundleProfileSchema.parse(input);
}