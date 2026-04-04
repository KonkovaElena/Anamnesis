import {
  appendFhirProvenance,
  decodeBase64Utf8,
  parseDocumentContentType,
  readOptionalString,
} from "./document-import-utils";
import {
  AnamnesisDomainError,
  type FhirImportInput,
} from "./contracts";
import type { ParsedFhirImport } from "./fhir-import-parsing";
import { classifyFhirImportProfile } from "../../core/normalization-profiles";

export function parseBinaryImport(input: FhirImportInput): ParsedFhirImport {
  const sourceContentType = parseDocumentContentType(readOptionalString(input.resource.contentType));
  if (!sourceContentType) {
    throw new AnamnesisDomainError(
      "fhir_import_content_type_unsupported",
      400,
      "FHIR Binary import only supports text/plain or text/markdown content in this slice.",
    );
  }

  const data = readOptionalString(input.resource.data);
  if (!data) {
    throw new AnamnesisDomainError(
      "fhir_import_requires_inline_data",
      400,
      "FHIR import requires inline attachment data. External dereference is out of scope.",
    );
  }

  return {
    artifactType: input.artifactType ?? "report",
    title: input.title ?? "FHIR Binary import",
    sourceDate: input.sourceDate,
    provenance: appendFhirProvenance(input.provenance, "Binary"),
    resourceType: "Binary",
    importProfile: classifyFhirImportProfile("Binary", "inline"),
    sourceContentType,
    textContent: decodeBase64Utf8(data),
  };
}